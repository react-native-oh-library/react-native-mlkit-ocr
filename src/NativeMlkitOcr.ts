/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';
import type { MlkitOcrResult } from './index.d';

export interface Spec extends TurboModule {
  detectFromUri(imagePath: string): Promise<MlkitOcrResult>;
  detectFromFile(imagePath: string): Promise<MlkitOcrResult>;
}

// @ts-ignore
export default TurboModuleRegistry.get<Spec>('MlkitOcrTurboModule');
