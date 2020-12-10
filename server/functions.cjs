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

const functions = require('firebase-functions');
const handlers = import('./handlers.js');

const DEFAULTS = functions.runWith({
	maxInstances: 100,
	memory: '2GB',
	timeoutSeconds: 60
});

let h;
const wrap = (name, opts) => (opts || DEFAULTS).https.onRequest(async (req, res, next) => {
	if (!h) h = await handlers;
	h[name](req, res, next);
});

exports.check = wrap('check');
exports.script = wrap('script');
exports.compiled = wrap('compiled');
