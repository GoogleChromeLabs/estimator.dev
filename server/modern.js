/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import babel from './babelworker.js';

export async function toOriginal(code) {
  return await babel(code, {
    babel: false,
    minifyAfter: true,
    minify: {
      compress: {
        arrows: false,
        passes: 1,
        ecma: 5
      },
      format: {
        shorthand: false
      },
      module: false,
      ecma: 5
    }
  });
}

export async function toModern(code) {
  return await babel(code, {
    generatorOpts: {
      // comments: false,
      minified: true,
      compact: true
    },
    parserOpts: {
      errorRecovery: true,
      ranges: false,
      tokens: false
    },
    minifyAfter: true,
    presets: [
      ['modernize', {
        loose: true,
        module: true,
        // disable webpack bundle inference for huge modules for performance reasons:
        webpack: code.length < 100e3
      }]
    ]
  });
}
