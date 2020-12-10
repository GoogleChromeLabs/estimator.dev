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

import polka from "polka";
import { body } from "./lib.js";
import { check, compiled, script } from "./handlers.js";

const server = polka({
  onError(err, req, res) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(err + '');
  }
});

server.get('/', (req, res) => res.end('hi'));
server.use("/api", body.json);
server.get("/api/check", check);
server.post("/api/check", check);
server.get("/api/script", script);
server.post("/api/script", script);
server.get('/_script/compiled', compiled);

server.listen(process.env.PORT || '8080');
// @ts-ignore-next
const { host, port } = server.server.address();
console.log(`http://${(host||'').replace(/::/,'') || 'localhost'}:${port}`);
