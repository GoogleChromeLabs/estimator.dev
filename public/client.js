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

import 'spectre.css/dist/spectre.min.css';
import 'spectre.css/dist/spectre-icons.min.css';
import { render } from 'preact';
import { useState, useReducer, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';

const memoize = (fn, cache={}) => arg => cache[arg] || (cache[arg] = fn(arg));

async function processResponse(res) {
  let data = await res.text();
  if (res.status === 200 && data === '') {
    return { error: 'timed out' };
  }
  try {
    data = JSON.parse(data);
  } catch(e) {}
  if (!res.ok) throw data;
  return data;
}

function post(url, body) {
  const ac = new AbortController();
  const p = fetch(url, {
    method: 'post',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: ac.signal
  }).then(processResponse);
  p.abort = ac.abort.bind(ac);
  return p;
}

const sleep = t => new Promise(r => setTimeout(r, t));

async function get(url, { retry = 0, timeout = 0, ac = new AbortController(), ...opts } = {}) {
  const abort = ac.abort.bind(ac);
  let p = fetch(url, { signal: ac.signal, ...opts }).then(processResponse);
  if (timeout) {
    let timer = setTimeout(abort, timeout * 1000);
    let clear = () => clearTimeout(timer);
    p.then(clear, clear);
  }
  if (retry) {
    p = p.catch(async () => {
      const ac = new AbortController();
      p.abort = ac.abort.bind(ac);
      await sleep(1000);
      return get(url, { retry: Number(retry)-1, timeout, ac, ...opts });
    });
  }
  p.abort = abort;
  return p;
}

const check = url => post('/api/check', { url });
const checkModern = memoize(url => {
  return get(`/api/script?url=${encodeURIComponent(url)}`, { retry: 3, timeout: 70 }).then(d => {
    d.final = true;
    return d;
  });
});
const SCRIPT_CACHE = new Map();

const initialUrl = (location.hash || '').substring(1);

function App() {
  const [url, setUrl] = useState(initialUrl);
  const [data, set] = useState(null);
  const [loading, setLoading] = useState(false);
  const current = useRef();
  current.url = url;
  current.loading = loading;

  useEffect(() => {
    if (initialUrl) {
      doCheck();
    }
  }, []);

  const urlChanged = useCallback(e => {
    setUrl(e.target.value);
  }, []);

  const doCheck = useCallback((e) => {
    if (e) e.preventDefault();
    if (current.loading) return;
    setLoading(true);
    let url = current.url;
    const origUrl = url;
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    if (self.ma) self.ma.trackEvent('Check', 'Check');
    check(url)
      .catch(e => ({ error: e && e.error || e }))
      .then(data => {
        if (data.error && self.ma) self.ma.trackEvent('Error', data.error + '');
        set(data);
        setLoading(false);
        setUrl(url => {
          if (url === origUrl && data.url) {
            url = data.url.replace(/^https:\/\//, '');
            if (!origUrl.endsWith('/')) url = url.replace(/\/$/, '');
            if (!origUrl.match(/[#?]/)) url = url.replace(/[#?].*$/, '');
            history.replaceState(null, null, '#' + origUrl);
          }
          return url;
        });
      });
  }, []);

  const scriptKey = (data && data.scripts || []).map(s => s.url).filter(Boolean).join('\n');
  useEffect(() => {
    const scripts = data && data.scripts;
    if (!scripts || !scripts.length) return;

    const aborts = [];
    let running = true;
    for (let i=0; i<scripts.length; i++) {
      const script = scripts[i];
      if (script.final) continue;
      let cached = SCRIPT_CACHE.get(script.url);
      if (cached) scripts[i] = cached;
      else {
        const f = checkModern(script.url);
        if (f.abort) aborts.push(f.abort);
        f.then(d => {
          if (!running) return;
          scripts[i] = d;
          const validScripts = scripts.filter(s => !s.nonjs);
          set(data => Object.assign({}, data, { scripts: validScripts }));
        });
      }
    }

    return () => {
      running = false;
      for (const a of aborts) if (a) a();
      aborts.length = 0;
    };
  }, [scriptKey]);

  let errors = data && data.scripts && data.scripts.reduce((acc, {url,error}) => {
    if (error) acc.push(<div class="toast toast-error"><pre>{url}</pre><pre>{error}</pre></div>);
    return acc;
  }, []);

  if (data && data.error) {
    errors = [
      <div class="toast toast-error">{String(data.error)}</div>
    ];
  }

  return (
    <div id="app">
      <header class="navbar my-2">
        <section class="navbar-section">
          <a href="https://github.com/GoogleChromeLabs/estimator.dev" class="btn btn-link">
            <i class="icon icon-resize-horiz mx-1" />
            GitHub
          </a>
        </section>
        <section class="navbar-center text-large">
          <span style="display:inline-block;background:#ffe426;color:#000;margin:-0.3em 1px 0;padding:.4em 2px 0 .5em;border-radius:3px;font-size:.9em;font-weight:500;">ES</span>timator
        </section>
        <section class="navbar-section">
          <a href="https://web.dev/publish-modern-javascript/" class="btn btn-link">
            Modern JS Guide
            <i class="icon icon-forward mx-1" />
          </a>
        </section>
      </header>

      <div class="container grid-md">
        <form class="my-2" action="#" autocomplete="off" onSubmit={doCheck}>
          <div class="input-group">
            <span class={`input-group-addon addon-lg${url.startsWith('http://')?' text-hide':''}`}>
              https://
            </span>
            <input
              name="url"
              class="form-input input-lg"
              placeholder="example.com"
              value={url}
              onInput={urlChanged}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <button type="submit" class={`btn btn-primary btn-lg input-group-btn${loading?' loading':''}`} disabled={loading}>
              Calculate
            </button>
          </div>
        </form>

        {errors && errors.length>0 && <div>{errors}</div>}

        {data && data.scripts ? (
          <Result url={url} {...data} />
        ) : (
          <div class="empty">
            <div class="empty-icon">
              <i class="icon icon-3x icon-resize-horiz" />
            </div>
            <p class="empty-title h5">Enter a website URL</p>
            <p class="empty-subtitle">Find out how much turning on modern JS could save.</p>
            <div class="empty-action">
              {loading ? (
                <div class="loading loading-lg" />
              ) : (
                <button class="btn btn-primary" onClick={doCheck}>Calculate</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const round = s => s > 10 ? (s|0) : s.toFixed(1);
const bytes = s => s>=1.5e6 ? round(s/1e6)+'mb' : s>=1500 ? round(s/1e3)+'kb' : s+'b';

const getDiff = (item, mode) => Math.round((item.size[mode] - (item.modernSize || item.size)[mode]) / item.size[mode] * 100);

function Result({ url, scripts }) {
  const parsedUrl = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`);

  let aggregate = useMemo(() => {
    return scripts && scripts.reduce((acc, item) => {
      acc.size.raw += item.size.raw;
      acc.size.gz += item.size.gz;
      const m = item.modernSize || item.size;
      // Modern JS is a superset of ES5, which means it's extraordinarily unlikely to ever be meaningfully larger.
      // If the API reports an increase, it's because my compiler is (very) imperfect.
      acc.modernSize.raw += m.raw < item.size.raw ? m.raw : item.size.raw;
      acc.modernSize.gz += m.gz < item.size.gz ? m.gz : item.size.gz;
      if (item.logs) acc.logs.push(...item.logs);
      acc.webpack = acc.webpack || item.webpack;
      acc.final = acc.final && item.final;
      return acc;
    }, { size: { raw:0, gz:0 }, modernSize: { raw:0, gz:0 }, logs: [], webpack: false, final: true });
  }, [scripts]);

  const [mode, toggleMode] = useReducer(mode => mode=='gz'?'raw':'gz', 'raw');
  const diff = getDiff(aggregate, mode);
  const diffCompressed = getDiff(aggregate, 'gz');

  const r = useRef();
  if (aggregate.final && r.current !== url) {
    r.current = url;
    if (self.ma) {
      self.ma.trackEvent('Result', aggregate.size.raw, diff);
      self.ma.trackEvent('Result-Gz', aggregate.size.gz, diffCompressed);
    }
  }

  const getDomain = u => {
    const parsed = new URL(u);
    return parsed.host==parsedUrl.host ? '' : parsed.hostname;
  };
  const getPath = u => new URL(u).pathname.replace(/[^/?#]+(?:[?#].*)?$/g, '').replace(/^\/$/g, '');
  const getBasename = u => (u.match(/([^/?#]+)(?:[?#].*)?$/) || [0,u])[1];
  const getTip = u => [getPath(u),getDomain(u)].filter(Boolean).join('\n')

  const click = useCallback(e => {
    const t = e.currentTarget;
    if (!e.shiftKey) return;
    setTimeout(() => open(`/_script/compiled?url=${encodeURIComponent(t.href)}&token=${encodeURIComponent(t.getAttribute('token'))}`), 1);
    return e.preventDefault(), false;
  }, []);

  if (scripts.length === 0) {
    return (
      <div class="card text-center">
        <div class="card-image pt-2">
          <i class="icon icon-3x icon-resize-horiz" />
        </div>
        <div class="card-header mb-2">
          <div class="card-title h4" style="margin-bottom:0.8rem;">
          No JavaScript detected.
          </div>
          <div class="card-subtitle">
            Can't get any smaller than 0 bytes!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="card-image">
        <div class="bg-gray" style="font-size:70%;display:flex;flex-wrap:wrap;justify-content:center;padding:2px;overflow:visible;">
          {scripts.map(script => (
            <div class="tile tile-centered" style="box-shadow:0 0 0.5px #000;background:#fff;margin:2px;padding:2px 3px;min-width:160px;max-width:300px;">
              <div class="tile-icon">
                {!script.final ? (
                  <span class="btn btn-clear loading" />
                ) : script.error ? (
                  <i class="icon icon-stop" title={'Error: ' + script.error} />
                ) : (
                  <span class={`label label-${getDiff(script,mode)>=0?'success':'gray text-error'} label-rounded`}>
                    {getDiff(script, mode)}%
                  </span>
                )}
              </div>
              <div class="tile-content" style="overflow:visible;max-width:260px;">
                <div class="tile-title tooltip tooltip-bottom" style="line-height:1;overflow:visible;" data-tooltip={getTip(script.url)}>
                  <a class="text-dark text-ellipsis" style="display:block;overflow:hidden;" href={script.url} token={script.token} target="_blank" onClick={click}>
                    {getBasename(script.url)}
                  </a>
                </div>
                <small class="tile-subtitle" style="line-height:1;">
                  <span class="text-gray">{bytes(script.size[mode])}</span>
                  {script.modernSize ? ` → ${bytes(script.modernSize[mode])}` : ''}
                </small>
              </div>
              {script.error && (
                <div class="tile-action">
                  <i class="icon icon-stop" title={'Error: ' + script.error} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div class="card-header mb-2" style={{ opacity: aggregate.final ? 1 : 0.5, transition: 'opacity 1s ease' }}>
        <div class="card-title h4" style="margin-bottom:0.8rem;">
          This site would be <mark class={aggregate.final?'':'loading'}>{diff}%</mark> faster with Modern JavaScript.
        </div>
        <div class="card-subtitle">
          <p class="mb-2">
            Currently, this site ships <strong>{bytes(aggregate.size[mode])}</strong> of
            Javascript (<abbr title="click to toggle" onClick={toggleMode}>{mode=='gz'?'compressed':'uncompressed'}</abbr>).
          </p>
          <p>
            Switching to modern JS would reduce that to <strong>{bytes(aggregate.modernSize[mode])}</strong>,
            while still supporting <em>95% of browsers</em> ✅
          </p>
          <div class="columns bg-gray py-2 s-rounded" style="align-items:center;">
            <div class="column col-auto">
              <span class="btn btn-sm btn-action btn-link text-gray bg-dark s-circle" disabled>
                <i class="icon icon-search" />
              </span>
            </div>
            <small class="column text-tiny">
              The savings of <strong>{bytes(aggregate.size[mode] - aggregate.modernSize[mode])}</strong> was calculated by
              "reverse-transpiling" {scripts.length} bundle{scripts.length==1?'':'s'} back to modern code.
            </small>
          </div>
        </div>
      </div>
      <div class="divider text-center" data-content="NEXT STEPS:" />
      <div class="m-2">
        <div class="columns">
        {aggregate.final && diffCompressed <= 5 && (
          <div class="column col-mx-auto my-2 col-6 col-md-12">
            <div class="card-body" style="background:#f8fafc;">
              <h6 class="card-title h6">Expecting more savings?</h6>
              <div class="card-subtitle my-1 text-small text-italic text-muted">
                Check for data or CSS bundled into your JavaScript.
              </div>
              <div class="card-subtitle text-small">
                Modern JS can't reduce the cost of this,
                so it's best to avoid inlining in the first place.
              </div>
            </div>
          </div>
        )}
        {aggregate.webpack && (
          <div class="column col-mx-auto my-2 col-6 col-md-12">
            <div class="card-body" style="background:#f8fafc;">
              <h6 class="card-title h6">Using webpack?</h6>
              <div class="card-subtitle my-1 text-small text-italic text-muted">
                It looks like this site might be bundled with webpack.
              </div>
              <div class="card-subtitle text-small">
                If so, you can turn on modern JavaScript in 5 minutes by installing <a target="_blank" href="https://github.com/developit/optimize-plugin">OptimizePlugin</a>.
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <div class="card-footer" style="display:flex;justify-content:center;align-items:center;gap:10px;">
        <span style="font-size:120%;">Ready to shave those bytes?</span>
        <a class="btn btn-d btn-lg" href="https://web.dev/publish-modern-javascript/" target="_blank">
          Turn on Modern JS
          <i class="icon icon-arrow-right mx-1" />
        </a>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  render(<App />, document.body);
  // @ts-ignore
  if (import.meta.hot) import.meta.hot.accept(({ module }) => render(<module.App />, document.body));
}

export async function prerender() {
  const renderToString = (await import('preact-render-to-string')).default;
  return renderToString(<App />);
}
