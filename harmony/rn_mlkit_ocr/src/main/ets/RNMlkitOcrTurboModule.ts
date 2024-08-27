/*
 * MIT License
 *
 * Copyright (C) 2024 Huawei Device Co., Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { TurboModule, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { textRecognition } from '@kit.CoreVisionKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { image } from '@kit.ImageKit';
import { http } from '@kit.NetworkKit';
import fs from '@ohos.file.fs';
import fileIo from '@ohos.file.fs';
import Logger from './Logger';

const TAG: string = 'RNOH in ocr'

type Point = {
  x: number;
  y: number;
};

type CornerPoints = Point[] | null;

type Bounding = {
  left: number;
  top: number;
  height: number;
  width: number;
};

type MLKTextElement = {
  text: string;
  cornerPoints: CornerPoints;
  bounding: Bounding;
};

type MLKTextLine = {
  text: string;
  elements: MLKTextElement[];
  cornerPoints: CornerPoints;
  bounding: Bounding;
};

type MKLBlock = {
  text: string;
  lines: MLKTextLine[];
  cornerPoints: CornerPoints;
  bounding: Bounding;
};

type MlkitOcrResult = MKLBlock[]

export class RNMlkitOcrTurboModule extends TurboModule {
  public ctx: TurboModuleContext
  private chooseImage: image.PixelMap | null = null;
  private imageSource: image.ImageSource | null = null;
  private imageUriPath: string = '';

  constructor(ctx: TurboModuleContext) {
    super(ctx)
    this.ctx = ctx
  }

  public detectFromUri(imagePath: string): Promise<MlkitOcrResult> {
    return new Promise(async (resolve) => {
      if (!imagePath) {
        Logger.error(TAG, 'detectFromUri', 'Failed to get uri.');
        return;
      }
      await this.loadImageWithUrl(imagePath);
      await this.loadImage(this.imageUriPath);
      let formatResults: MlkitOcrResult = await this.textRecognition();
      Logger.info(TAG, 'detectFromUri', formatResults.toString());
      if (this.chooseImage && this.imageSource) {
        this.chooseImage.release();
        this.imageSource.release();
      }
      this.ctx.rnInstance.emitDeviceEvent('detectFromUri', formatResults);
      resolve(formatResults);
    });
  }

  public detectFromFile(imagePath: string): Promise<MlkitOcrResult> {
    return new Promise(async (resolve) => {
      if (!imagePath) {
        Logger.error(TAG, 'detectFromFile', 'Failed to get path.');
        return;
      }
      await this.loadImage(imagePath);
      let formatResults: MlkitOcrResult = await this.textRecognition();
      if (this.chooseImage && this.imageSource) {
        this.chooseImage.release();
        this.imageSource.release();
      }
      resolve(formatResults);
    });
  }

  prepareOutput(result: textRecognition.TextRecognitionResult): MKLBlock[] {
    const output: MKLBlock[] = [];
    for (const textBlock of result.blocks) {
      const blockElements: MLKTextLine[] = [];
      for (const textLines of textBlock.lines) {
        const lineElements: MLKTextElement[] = [];
        for (const textLine of textLines.words) {
          const element: MLKTextElement = {
            text: '',
            cornerPoints: null,
            bounding: {
              left: 0,
              top: 0,
              height: 0,
              width: 0
            }
          };
          element.text = textLine.value;
          element.cornerPoints = this.getCornerLinePoints(textLine.cornerPoints);
          element.bounding = {
            left: 0,
            top: 0,
            height: 0,
            width: 0
          };
          lineElements.push(element);
        }
        const line: MLKTextLine = {
          text: '',
          elements: [],
          cornerPoints: null,
          bounding: {
            left: 0,
            top: 0,
            height: 0,
            width: 0
          }
        };
        line.text = textLines.value;
        line.cornerPoints = this.getCornerLinePoints(textLines.cornerPoints);
        line.elements = lineElements;
        line.bounding = {
          left: 0,
          top: 0,
          height: 0,
          width: 0
        };
        blockElements.push(line);
      }
      const mklBlock: MKLBlock = {
        text: '',
        lines: [],
        cornerPoints: null,
        bounding: {
          left: 0,
          top: 0,
          height: 0,
          width: 0
        }
      };
      mklBlock.text = textBlock.value;
      mklBlock.cornerPoints = [];
      mklBlock.bounding = {
        left: 0,
        top: 0,
        height: 0,
        width: 0
      }
      mklBlock.lines = blockElements;
      output.push({
        text: mklBlock.text,
        lines: mklBlock.lines,
        cornerPoints: [],
        bounding: mklBlock.bounding,
      });
    }
    return output;
  }

  getCornerLinePoints(cornerPoints: textRecognition.PixelPoint[]): Point[] | null {
    let resultPixelPoint: Point[] | null = []
    if (cornerPoints === null) {
      return resultPixelPoint;
    }
    for (const point of cornerPoints) {
      resultPixelPoint.push(point);
    }
    return resultPixelPoint;
  }

  addListener(name: string): void {
    Logger.info(TAG, 'addListener', name);
  }

  removeListeners(): void {
    Logger.info(TAG, 'removeListeners');
  }

  private loadImageWithUrl(url: string) {
    let TIMEOUT: number = 60000;
    return new Promise((resolve, reject) => {
      let httpRequest: http.HttpRequest = http.createHttp();
      httpRequest.request(url,
        {
          method: http.RequestMethod.GET,
          connectTimeout: TIMEOUT,
          readTimeout: TIMEOUT
        },
        async (error: BusinessError, data: http.HttpResponse) => {
          if (error) {
            Logger.error(TAG, `http reqeust failed with. Code: ${error.code}`);
            httpRequest.destroy();
            reject(error)
          } else {
            if (http.ResponseCode.OK === data.responseCode) {
              let imageBuffer: ArrayBuffer = data.result as ArrayBuffer;
              try {
                let context = this.ctx.uiAbilityContext as common.UIAbilityContext;
                let lastIndex: number = url.lastIndexOf('/');
                let fileName: string = url.substring(lastIndex + 1);
                let filesDir: string = context.filesDir + fileName;
                let file: fs.File = await fileIo.open(filesDir, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE);
                await fileIo.write(file.fd, imageBuffer);
                await fileIo.close(file.fd);
                this.imageUriPath = filesDir;
                httpRequest.destroy();
                resolve(filesDir)
              } catch (error) {
                Logger.error(TAG, `error is ${error}}`);
                reject(`error is ${error}}`)
              }
            } else {
              reject('error occurred when image downloaded!')
              Logger.error(TAG, 'error occurred when image downloaded!');
            }
          }
        })
    })

  }

  private async loadImage(imagePath: string): Promise<void> {
    try {
      let fileSource: fs.File = await fs.openSync(imagePath, fs.OpenMode.READ_WRITE);
      this.imageSource = image.createImageSource(fileSource.fd);
      this.chooseImage = await this.imageSource.createPixelMap();
    } catch (error) {
      Logger.error(TAG, `loadImage: ${error}`);
    }
  }

  private async textRecognition(): Promise<MlkitOcrResult> {
    if (!this.chooseImage) {
      return;
    }
    let visionInfo: textRecognition.VisionInfo = {
      pixelMap: this.chooseImage
    };
    let recognitionResult: textRecognition.TextRecognitionResult = await textRecognition.recognizeText(visionInfo);
    let formatResults: MlkitOcrResult = this.prepareOutput(recognitionResult);
    return formatResults;
  }
}