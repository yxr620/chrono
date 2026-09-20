import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    // UIKit creates this window and MainViewController from the scene's Main storyboard.
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }

        // Scene-based apps receive cold-start links here instead of in AppDelegate.
        for context in connectionOptions.urlContexts {
            open(context)
        }
        for userActivity in connectionOptions.userActivities {
            continueActivity(userActivity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            open(context)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueActivity(userActivity)
    }

    private func open(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [
            .openInPlace: context.options.openInPlace
        ]
        if let sourceApplication = context.options.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }

        // Capacitor 7 exposes ApplicationDelegateProxy, but no SceneDelegateProxy yet.
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    private func continueActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
