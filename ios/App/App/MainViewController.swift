import UIKit
import Capacitor

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(IOSWheelDateTimePickerPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        updateWebViewBackground()

        // The web UI draws its own header; avoid a native shadow below the status bar.
        if #available(iOS 26.0, *) {
            webView?.scrollView.topEdgeEffect.isHidden = true
        }
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            updateWebViewBackground()
        }
    }

    private func updateWebViewBackground() {
        // Match the CSS dark mode background: hsl(222.2, 84%, 4.9%) = #020817
        let darkColor = UIColor(red: CGFloat(2)/CGFloat(255), green: CGFloat(8)/CGFloat(255), blue: CGFloat(23)/CGFloat(255), alpha: 1)
        // Match the CSS light mode background: hsl(230, 14%, 94%) = #EEEEF2
        let lightColor = UIColor(red: CGFloat(238)/CGFloat(255), green: CGFloat(238)/CGFloat(255), blue: CGFloat(242)/CGFloat(255), alpha: 1)

        let bgColor = traitCollection.userInterfaceStyle == .dark ? darkColor : lightColor

        view.backgroundColor = bgColor
        webView?.backgroundColor = bgColor
        webView?.scrollView.backgroundColor = bgColor
        webView?.isOpaque = false
    }
}

@objc(IOSWheelDateTimePickerPlugin)
public class IOSWheelDateTimePickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IOSWheelDateTimePickerPlugin"
    public let jsName = "IOSWheelDateTimePicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    @objc public func present(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let initialValue = call.getString("value")
            let initialDate = Self.parseInitialDate(initialValue)
            let daysBefore = max(0, call.getInt("daysBefore") ?? 15)
            let daysAfter = max(0, call.getInt("daysAfter") ?? 15)

            let pickerVC = WheelDateTimePickerViewController(
                initialDate: initialDate,
                daysBefore: daysBefore,
                daysAfter: daysAfter
            )

            pickerVC.onCancel = {
                call.resolve(["cancelled": true])
            }

            pickerVC.onConfirm = { selectedDate in
                let iso = ISO8601DateFormatter().string(from: selectedDate)
                call.resolve([
                    "cancelled": false,
                    "value": iso
                ])
            }

            pickerVC.modalPresentationStyle = .pageSheet
            pickerVC.preferredContentSize = CGSize(width: 0, height: 380)
            if #available(iOS 16.0, *) {
                if let sheet = pickerVC.sheetPresentationController {
                    sheet.detents = [
                        .custom(identifier: .init("wheelCompact")) { _ in
                            return 340
                        }
                    ]
                    sheet.prefersGrabberVisible = true
                    sheet.prefersScrollingExpandsWhenScrolledToEdge = false
                }
            } else if #available(iOS 15.0, *) {
                if let sheet = pickerVC.sheetPresentationController {
                    sheet.detents = [.medium()]
                    sheet.prefersGrabberVisible = true
                    sheet.prefersScrollingExpandsWhenScrolledToEdge = false
                }
            }

            guard let rootVC = self.bridge?.viewController else {
                call.reject("Unable to present picker view controller")
                return
            }

            rootVC.present(pickerVC, animated: true)
        }
    }

    private static func parseInitialDate(_ value: String?) -> Date {
        guard let value, !value.isEmpty else {
            return Date()
        }

        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        let standardFormatter = ISO8601DateFormatter()
        standardFormatter.formatOptions = [.withInternetDateTime]
        if let date = standardFormatter.date(from: value) {
            return date
        }

        return Date()
    }
}

private final class WheelDateTimePickerViewController: UIViewController, UIPickerViewDataSource, UIPickerViewDelegate {
    private struct DateItem {
        let date: Date
        let value: String
        let label: String
    }

    private let initialDate: Date
    private let daysBefore: Int
    private let daysAfter: Int
    private let pickerView = UIPickerView()

    private var dateItems: [DateItem] = []
    private var selectedDateIndex: Int = 0
    private var selectedHour: Int = 0
    private var selectedMinute: Int = 0

    var onCancel: (() -> Void)?
    var onConfirm: ((Date) -> Void)?

    init(initialDate: Date, daysBefore: Int, daysAfter: Int) {
        self.initialDate = initialDate
        self.daysBefore = daysBefore
        self.daysAfter = daysAfter
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        buildDateItems()
        setupLayout()
        selectInitialRows()
    }

    private func setupLayout() {
        let headerView = UIView()
        headerView.translatesAutoresizingMaskIntoConstraints = false

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("取消", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        cancelButton.setTitleColor(.secondaryLabel, for: .normal)
        cancelButton.backgroundColor = .tertiarySystemFill
        cancelButton.layer.cornerRadius = 16
        cancelButton.clipsToBounds = true
        cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)

        let confirmButton = UIButton(type: .system)
        confirmButton.translatesAutoresizingMaskIntoConstraints = false
        confirmButton.setTitle("确定", for: .normal)
        confirmButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        confirmButton.setTitleColor(.white, for: .normal)
        confirmButton.backgroundColor = .systemBlue
        confirmButton.layer.cornerRadius = 16
        confirmButton.clipsToBounds = true
        confirmButton.addTarget(self, action: #selector(handleConfirm), for: .touchUpInside)

        headerView.addSubview(cancelButton)
        headerView.addSubview(confirmButton)

        pickerView.translatesAutoresizingMaskIntoConstraints = false
        pickerView.dataSource = self
        pickerView.delegate = self

        view.addSubview(headerView)
        view.addSubview(pickerView)
        view.bringSubviewToFront(headerView)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            headerView.heightAnchor.constraint(equalToConstant: 34),

            cancelButton.leadingAnchor.constraint(equalTo: headerView.leadingAnchor),
            cancelButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            cancelButton.widthAnchor.constraint(equalToConstant: 68),
            cancelButton.heightAnchor.constraint(equalToConstant: 34),

            confirmButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor),
            confirmButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            confirmButton.widthAnchor.constraint(equalToConstant: 68),
            confirmButton.heightAnchor.constraint(equalToConstant: 34),

            pickerView.topAnchor.constraint(equalTo: headerView.bottomAnchor, constant: -20),
            pickerView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            pickerView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            pickerView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func buildDateItems() {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let initialDay = calendar.startOfDay(for: initialDate)

        let valueFormatter = DateFormatter()
        valueFormatter.calendar = calendar
        valueFormatter.locale = Locale(identifier: "en_US_POSIX")
        valueFormatter.dateFormat = "yyyy-MM-dd"

        let fallbackLabelFormatter = DateFormatter()
        fallbackLabelFormatter.calendar = calendar
        fallbackLabelFormatter.locale = Locale(identifier: "en_US")
        fallbackLabelFormatter.dateFormat = "EEE MM/dd"

        let shortDateFormatter = DateFormatter()
        shortDateFormatter.calendar = calendar
        shortDateFormatter.locale = Locale(identifier: "en_US")
        shortDateFormatter.dateFormat = "MM/dd"

        var generated: [DateItem] = []

        for offset in (-daysBefore)...daysAfter {
            guard let date = calendar.date(byAdding: .day, value: offset, to: initialDay) else {
                continue
            }

            let value = valueFormatter.string(from: date)
            let label: String

            if calendar.isDate(date, inSameDayAs: today) {
                label = "Today \(shortDateFormatter.string(from: date))"
            } else {
                label = fallbackLabelFormatter.string(from: date)
            }

            generated.append(DateItem(date: date, value: value, label: label))
        }

        dateItems = generated

        if let index = dateItems.firstIndex(where: { $0.value == valueFormatter.string(from: initialDay) }) {
            selectedDateIndex = index
        } else {
            selectedDateIndex = max(0, dateItems.count / 2)
        }
    }

    private func selectInitialRows() {
        let calendar = Calendar.current
        selectedHour = calendar.component(.hour, from: initialDate)
        selectedMinute = calendar.component(.minute, from: initialDate)

        pickerView.reloadAllComponents()
        pickerView.selectRow(selectedDateIndex, inComponent: 0, animated: false)
        pickerView.selectRow(selectedHour, inComponent: 1, animated: false)
        pickerView.selectRow(selectedMinute, inComponent: 2, animated: false)
    }

    @objc private func handleCancel() {
        dismiss(animated: true) {
            self.onCancel?()
        }
    }

    @objc private func handleConfirm() {
        guard !dateItems.isEmpty else {
            dismiss(animated: true) {
                self.onCancel?()
            }
            return
        }

        // 直接从 pickerView 读取当前选中行（惯性滚动中也能返回正确值）
        let dateRow = min(max(pickerView.selectedRow(inComponent: 0), 0), dateItems.count - 1)
        let hourRow = min(max(pickerView.selectedRow(inComponent: 1), 0), 23)
        let minuteRow = min(max(pickerView.selectedRow(inComponent: 2), 0), 59)

        let calendar = Calendar.current
        let baseDate = dateItems[dateRow].date

        var components = calendar.dateComponents([.year, .month, .day], from: baseDate)
        components.hour = hourRow
        components.minute = minuteRow
        components.second = 0
        components.nanosecond = 0

        guard let resultDate = calendar.date(from: components) else {
            dismiss(animated: true) {
                self.onCancel?()
            }
            return
        }

        dismiss(animated: true) {
            self.onConfirm?(resultDate)
        }
    }

    func numberOfComponents(in pickerView: UIPickerView) -> Int {
        return 3
    }

    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
        switch component {
        case 0:
            return dateItems.count
        case 1:
            return 24
        default:
            return 60
        }
    }

    func pickerView(_ pickerView: UIPickerView, widthForComponent component: Int) -> CGFloat {
        let total = pickerView.bounds.width
        switch component {
        case 0:
            return total * 0.6
        default:
            return total * 0.2
        }
    }

    func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat {
        return 36
    }

    func pickerView(_ pickerView: UIPickerView, viewForRow row: Int, forComponent component: Int, reusing view: UIView?) -> UIView {
        let rowWidth = pickerView.rowSize(forComponent: component).width
        let container = UIView(frame: CGRect(x: 0, y: 0, width: rowWidth, height: 36))

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.85
        label.textColor = .label

        switch component {
        case 0:
            guard row < dateItems.count else { return container }
            label.text = dateItems[row].label
            label.font = .systemFont(ofSize: 18, weight: .semibold)
            label.textAlignment = .center
        case 1:
            label.text = String(format: "%02d", row)
            label.font = .monospacedDigitSystemFont(ofSize: 18, weight: .semibold)
            label.textAlignment = .left
        default:
            label.text = String(format: "%02d", row)
            label.font = .monospacedDigitSystemFont(ofSize: 18, weight: .semibold)
            label.textAlignment = .left
        }

        container.addSubview(label)

        if component == 0 {
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
                label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -4),
                label.centerYAnchor.constraint(equalTo: container.centerYAnchor)
            ])
        } else {
            NSLayoutConstraint.activate([
                label.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                label.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                label.centerYAnchor.constraint(equalTo: container.centerYAnchor)
            ])
        }

        return container
    }

    func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
        switch component {
        case 0:
            selectedDateIndex = row
        case 1:
            selectedHour = row
        default:
            selectedMinute = row
        }
    }
}
