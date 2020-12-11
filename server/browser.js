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

import puppeteer from "puppeteer";

let browser;
let launching;

process.on('beforeExit', () => {
  if (browser) try { browser.close(); }catch (e) {}
  browser = launching = null;
});

/**
 * @template T
 * @param {((page: puppeteer.Page) => Promise<T> | T)} fn
 * @returns {Promise<T>}
 */
export async function withPage(fn) {
  if (!launching) {
    launching = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-infobars',
        '--no-zygote',
        '--ignore-certificate-errors',
        '--single-process',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=800x600'
      ]
    });
  }
  if (!browser) browser = await launching;
  let page;
  try {
    page = await browser.newPage();
    page._client.send('Network.setBypassServiceWorker', {bypass: true});
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.47 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', interceptRequest);
    return await fn(page);
  } finally {
    try {
      page.close();
    }catch(e) {}
  }
}

const blockedResourceTypes = [
  'image',
  'media',
  'stylesheet',
  'fetch',
  'other',
  'font',
  'texttrack',
  'object',
  'beacon',
  'csp_report',
  'imageset',
];

const skippedResources = [
  'quantserve',
  'adzerk',
  'doubleclick',
  'adition',
  'exelator',
  'sharethrough',
  'cdn.api.twitter',
  'cdn.jsdelivr.net',
  'google-analytics',
  'googletagmanager',
  'fontawesome',
  'facebook',
  'analytics',
  'optimizely',
  'clicktale',
  'mixpanel',
  'zedo',
  'clicksor',
  'tiqcdn',
  'platform.twitter.com/widgets',
  'youtube.com/embed',
  'youtube.com/s/player',
  'subscribewithgoogle',
  'cdn.sift.com',
  'google.com/js/bg/',
  'contextual.media.net',
  '.criteo.com',
  '.rubiconproject.com',
  '.geoedge.be',
  'amazon-adsystem.com',
  'news.google.com/swg/',
  '/dfp.min.js',
  'polyfill.io/'
];

const allows = new Set(['script', 'document', 'xhr', 'fetch']);
function interceptRequest(request) {
  const requestUrl = request.url().replace(/[?#].*$/g, '');
  if (
    blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
    skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
  ) {
    request.abort();
  } else {
    if (!allows.has(request.resourceType())) {
      allows.add(request.resourceType());
    }
    request.continue();
  }
}
