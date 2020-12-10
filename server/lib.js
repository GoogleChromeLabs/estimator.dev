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

export function body(req, res, next) {
  req.body = '';
  req.on('data', chunk => req.body += chunk);
  req.on('end', () => next());
  req.on('error', next);
}

body.json = (req, res, next) => {
  return body(req, res, err => {
    if (!err && req.body) try{ req.body=JSON.parse(req.body) }catch(e){ err=e }
    next(err);
  });
};

export function api(fn) {
  return async (req, res, next) => {
    const DEBUG = req.hostname === 'localhost';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const result = await fn(req, res);
      if (!res.writableEnded && result !== undefined && result !== res) {
        res.write(JSON.stringify(result));
      }
      if (!res.writableEnded) res.end();
    } catch (e) {
      console.error(e);
      res.status(500);
      res.send(JSON.stringify({ error: String(DEBUG && (e && e.stack) || e) }));
    }
  }
}

import { get as httpGet, Agent as HttpAgent } from 'http';
import { get as httpsGet, Agent as HttpsAgent } from 'https';
import * as zlib from 'zlib';

const httpsAgent = new HttpsAgent({ keepAlive: true, keepAliveMsecs: 60e3 });
const httpAgent = new HttpAgent({ keepAlive: true, keepAliveMsecs: 60e3 });

export async function get(url) {
	return new Promise((resolve, reject) => {
    let redirectCount = 0;
    doFetch(url);

    function doFetch(url) {
      const proto = url.match(/^https?:\/\//);
      if (!proto) return reject(Error('Invalid URL'));
      const origin = url.match(/^https?:\/\/[^/]+/)[0];
      const https = proto[0]==='https://';
      const g = https ? httpsGet : httpGet;
      const agent = https ? httpsAgent : httpAgent;

      g(url, {
        agent,
        headers: {
          'Accept-Encoding': `${zlib.createBrotliDecompress ? 'br,' : ''}gzip,deflate`,
          'Accept': 'application/javascript, text/javascript, */*',
          'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
          'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.47 Safari/537.36`,
          'Origin': origin,
          'Referer': origin,
          'Cookie': '_ga=GA42.4242',
          'sec-ch-ua-mobile': '?0',
          'Sec-Fetch-Dest': 'script',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        }
      }, res => {
        let status = res.statusCode,
            ok = status<400 && status>=100,
            headers = res.headers,
            body = '',
            bodyStream;
        if (status >= 300 && status < 400 && headers.location) {
          const newUrl = new URL(headers.location, url).href;
          if (++redirectCount > 10 || newUrl === url) {
            return reject(Error('Too many redirects'));
          }
          console.log(`REDIRECT to ${headers.location} from ${url}:\n  ${newUrl}`);
          return doFetch(newUrl);
        }
        switch (headers['content-encoding']) {
          case 'br':
            res.pipe(bodyStream = zlib.createBrotliDecompress(), {end:true});
            break;
          case 'gzip':
          case 'deflate':
            res.pipe(bodyStream = zlib.createUnzip(), {end:true});
            break;
        }
        (bodyStream || res).on('data', chunk => { body += chunk.toString('utf-8'); });
        (bodyStream || res).once('end', () => { resolve({ ok, status, body, headers, res }) });
      });
    }
	});
}
