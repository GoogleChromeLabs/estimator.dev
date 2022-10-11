**⚠️ This repo is no longer maintained. We now recommend developers use the [`legacy-javascript`](https://github.com/GoogleChrome/lighthouse/pull/10303) audit in Lighthouse to assess the benefits of switching to modern JavaScript syntax.**

# EStimator

Calculate the size and performance improvement a site could achieve by switching to modern JavaScript syntax.

### Privacy

Submitting a URL for analysis is stateless. The service does not store any information about you or the URLs you analyze.
A minimal Google Analytics ping is used to record page visits _(URL and referrer)_ and JavaScript errors, as well as the total calculated size difference number _(but not the URL you entered)_.

### Hacking

```sh
# clone it
git clone git@github.com:GoogleChromeLabs/estimator.dev.git
cd estimator.dev

# install dependencies and firebase CLI
npm install
npm install -g firebase-tools

# build the front-end:
npm run build

# start the server and functions
firebase emulators:start
```
