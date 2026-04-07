/// <reference types="node" />

import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';

import { APP_TOP_TOAST_CLASS, decorateToastOptions } from '../src/utils/appToast';

interface TestToastOptions {
  message: string;
  position: 'top' | 'bottom';
  color: 'success' | 'warning';
  cssClass?: string | string[];
}

const topToast = decorateToastOptions<TestToastOptions>({
  message: '目标已更新',
  position: 'top',
  color: 'success',
});

assert.deepEqual(topToast.cssClass, [APP_TOP_TOAST_CLASS]);

const topToastWithExistingClass = decorateToastOptions<TestToastOptions>({
  message: '同步成功',
  position: 'top',
  color: 'success',
  cssClass: ['existing-class'],
});

assert.deepEqual(topToastWithExistingClass.cssClass, ['existing-class', APP_TOP_TOAST_CLASS]);

const bottomToast = decorateToastOptions<TestToastOptions>({
  message: '底部提示',
  position: 'bottom',
  color: 'warning',
});

assert.equal(bottomToast.cssClass, undefined);

const appCss = fs.readFileSync(path.resolve('src/App.css'), 'utf8');

assert.match(appCss, /--app-top-toast-height:\s*40px;/, 'mobile top toast height should be reduced to 40px');
assert.match(appCss, /--app-top-toast-height:\s*38px;/, 'desktop top toast height should be reduced to 38px');
assert.match(appCss, /--app-top-toast-scale-y:\s*0\.92;/, 'top toast should use vertical compression on mobile');
assert.match(appCss, /scaleY\(var\(--app-top-toast-scale-y\)\)/, 'top toast container should apply vertical scaling');

console.log('app toast option tests passed');