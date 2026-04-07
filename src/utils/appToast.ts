export const APP_TOP_TOAST_CLASS = 'app-top-toast';

type ToastCssClass = string | string[] | undefined;

interface ToastOptionsLike {
  position?: 'top' | 'bottom' | 'middle' | string;
  cssClass?: ToastCssClass;
}

function normalizeCssClass(cssClass: ToastCssClass): string[] {
  if (!cssClass) {
    return [];
  }

  return Array.isArray(cssClass) ? cssClass : [cssClass];
}

export function decorateToastOptions<T extends ToastOptionsLike>(options: T): T {
  if (options.position !== 'top') {
    return options;
  }

  const cssClass = normalizeCssClass(options.cssClass);
  if (cssClass.includes(APP_TOP_TOAST_CLASS)) {
    return options;
  }

  return {
    ...options,
    cssClass: [...cssClass, APP_TOP_TOAST_CLASS],
  };
}