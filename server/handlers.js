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

import gzipSize from 'gzip-size';
import Cache from 'quick-lru';
import uuid from '@lukeed/uuid';
import { api, get } from "./lib.js";
import { withPage } from "./browser.js";
import { toModern, toOriginal } from './modern.js';

async function getSize(str) {
  return { raw: Buffer.byteLength(str), gz: await gzipSize(str) };
}

const SCRIPT_CACHE = new Cache({ maxSize: 500 });
const MODERN_CACHE = new Cache({ maxSize: 500 });

export const check = api(async (req, res) => {
  const { pageUrl, coverage } = await withPage(async page => {
    await page.coverage.startJSCoverage();
    await page.goto(req.body.url, {
      timeout: 20000,
      waitUntil: 'networkidle2'
    });
    return {
      pageUrl: page.url(),
      coverage: await page.coverage.stopJSCoverage()
    }
  });
  const seen = new Set();
  const scripts = (await Promise.all(coverage.map(async ({ url, text }) => {
    // ignore tiny files
    if (text.length < 50 || url === pageUrl || seen.has(url)) return;
    if (/^(data|blob)\:/.test(url)) return;
    seen.add(url);
    const size = await getSize(text);
    SCRIPT_CACHE.set(url, { text, size });
    return { url, size };
  }))).filter(Boolean);
  return { url: pageUrl, scripts };
});

// const origin = req => `http${req.socket.encrypted?'s':''}://${req.headers['x-forwarded-host'] || req.headers.host}`;

export const script = api(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=7200');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  let url = req.body && req.body.url || req.query.url;
  req.query.info = true;

  if (MODERN_CACHE.has(url)) {
    let cached = MODERN_CACHE.get(url);
    let modern = cached.code;
    cached = Object.assign({}, cached);
    cached.code = undefined;

    if (req.query.info) {
      res.setHeader('Content-Type', 'text/json; charset=utf-8');
      return cached;
    }
    return res.end(`//#meta=${JSON.stringify(cached)}\n${modern}`);
  }
  let text, size;
  if (SCRIPT_CACHE.has(url)) {
    ({ text, size } = SCRIPT_CACHE.get(url));
  }
  else {
    const { ok, body } = await get(url);
    if (!ok) throw `Failed to fetch ${url}`;
    text = body;
    if (/^\s*<(\!DOCTYPE|html|body|head|title)\b/i.test(text)) {
      if (req.query.info) {
        res.setHeader('Content-Type', 'text/json; charset=utf-8');
        return { error: 'Not JavaScript', nonjs: true, text };
      }
    }
    const result = await toOriginal(text);
    size = await getSize(result.code);
    SCRIPT_CACHE.set(url, { text, size });
  }
  let modern, logs, modernSize, error;
  try {
    const result = await toModern(text);
    modern = result.code;
    logs = result.logs.filter(l => !/external module reference:/i.test(l)).map(l => l.trim().split('\n')[0].slice(0, 200));
    modernSize = await getSize(modern);
    if (modernSize.gz > size.gz) modernSize.gz = size.gz + 1;
    if (modernSize.raw > size.raw) modernSize.raw = size.raw + 1;
  } catch (e) {
    error = String(e);
  }
  if (logs) {
    let logSize = 0;
    for (let i=0; i<logs.length; i++) {
      if (logSize > 4000) {
        logs.length = i;
        break;
      }
      logSize += logs[i].length + 4;
    }
  }
  const webpack = logs && !!logs.find(l => /is a Webpack bundle/i.test(l));
  const result = { url, size, logs, modernSize, webpack, error, token: uuid() };
  MODERN_CACHE.set(url, Object.assign({ code: modern }, result));

  if (req.query.info) {
    res.setHeader('Content-Type', 'text/json; charset=utf-8');
    return result;
  }
  res.end(`//#meta=${JSON.stringify(result)}\n${modern}`);
});

export const compiled = async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=7200');

  const { url, token } = req.query;
  const cached = MODERN_CACHE.get(url);
  if (!cached) {
    const text = (await get(url)).body;
    if (/^\s*<(\!DOCTYPE|html|body|head|title)\b/i.test(text)) throw 'Not JavaScript';
    const result = await toModern(text);
    return res.end(result.code);
  }
  if (cached.token !== token) throw 'invalid token';
  return res.end(cached.code);
};
