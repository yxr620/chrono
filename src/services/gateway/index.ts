export * from './types';
export { ByoGateway } from './byoGateway';
export { ManagedGateway } from './managedGateway';
export { CompositeGateway } from './compositeGateway';

import { CompositeGateway } from './compositeGateway';

/** 应用级单例 gateway */
export const gateway = new CompositeGateway();
