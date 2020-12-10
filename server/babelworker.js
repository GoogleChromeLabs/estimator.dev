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

import { Worker } from 'worker_threads';

function greenlet(fn) {
	let n = 0,
		t = {};
	function a(port, fn) {
		port.on('message', async ([id, params]) => {
			try {
				port.postMessage([id, 0, await fn(...params)]);
			} catch (e) {
				port.postMessage([id, 1, (e && e.stack) || e + '']);
			}
		});
	}
	function g(...args) {
		return new Promise((s, f) => ((t[++n] = [s, f]), w.postMessage([n, args])));
	}
	g.terminate = () => w.terminate();
	let w = (g.worker = new Worker(`(${a})(require("worker_threads").parentPort,${fn})`, { eval: true }));
	w.on('message', ([id, x, result]) => (t[id] = t[id][x](result)));
	return g;
}

async function runBabel(code, opts) {
  let logs = [];
  let c = global.console;
  global.console = {};
  for (let method of ['log','info','warn','error']) {
    global.console[method] = function(...args) {
      if (args.length === 0) return;
      let log = args.join(', ');
      if (!log || /No binding for |unary --> polyfill/.test(log)) return;
      if (method !== 'log' && method !== 'info') log = method + ': ' + log;
      logs.push(log);
    };
  }
  const { babel, minifyAfter, minify = {}, ...babelOpts } = opts || {};
  let result;
  if (babel === false) {
    result = { code };
  }
  else {
    try {
      result = require('@babel/core').transformSync(code, {
        configFile: false,
        babelrc: false,
        sourceMap: false,
        inputSourceMap: false,
        sourceType: 'unambiguous',
        highlightCode: false,
        wrapPluginVisitorMethod(key, nodeType, fn) {
          return function(...args) {
            try {
              return fn.apply(this, args);
            } catch (err) {
              let m = err && err.message || String(err);
              console.error(key+'('+nodeType+'): '+m);
            }
          };
        },
        ...babelOpts
      });
    } catch (err) {
      throw Error(`Parse Error: ${err && err.message || err}`);
    }
  }
  if (minifyAfter) {
    try {
      const r = await require('terser').minify(result.code, {
        module: true,
        ecma: 2017, // 2020
        safari10: true,
        sourceMap: false,
        keep_fnames: true,
        keep_classnames: true,
        ...minify,
        compress: {
          arrows: true,
          dead_code: false,
          collapse_vars: true,
          ecma: 2020,
          drop_console: false,
          inline: true,
          passes: 2,
          ...(minify.compress || {})
        },
        mangle: {
          properties: false,
          ...(minify.mangle || {})
        },
        format: {
          comments: 'all',
          shorthand: true,
          ...(minify.format || {})
        }
      });
      result.code = r.code;
    } catch(e) {
      logs.push(`Minified error: ${e.message}`);
    }
  }
  global.console = c;
  return { code: result.code, logs };
}


let tasks = [];
let workers = [];
const MAX = 8;

for (let i=0; i<2; i++) {
  const w = greenlet(runBabel);
  workers.push(w);
  w('var a=1;');
}

export default function babel(code, opts) {
  return new Promise((resolve, reject) => {
    tasks.push(w => w(code, opts).then(resolve).catch(reject));
    check();
  });
}

function check() {
  if (!tasks.length) return;
  let worker = workers.find(w => !w.busy);
  if (!worker && workers.length < MAX) {
    worker = greenlet(runBabel);
    workers.push(worker);
  }
  if (!worker) {
    return;
  }
  worker.busy = true;
  const task = tasks.shift();
  task(worker).catch(()=>{}).then(() => {
    worker.busy = false;
    setTimeout(check);
  });
}