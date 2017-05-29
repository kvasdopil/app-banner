import React, { Component } from 'react';
import docCookies from 'doc-cookies';
import Base64 from 'min-base64';
import PromisePF from 'promise-polyfill';

import MobileBanner from './MobileBanner';
import DesktopBanner from './DesktopBanner';
import BannerWrapper from './BannerWrapper';

import locales from '../lib/locales';

const Mobile = BannerWrapper(MobileBanner);
const Desktop = BannerWrapper(DesktopBanner);

const cookieName = 'AppBanner';

// To add to window
if (!window.Promise) {
  window.Promise = PromisePF;
}

// FIXME: hide if presencekit is running

// TODO: make cookieName customizeable
// TODO: check is position works
// TODO: test for npm pack
// TODO: test for React component via npm
// TODO: unit test for this component

function trackView() {
  const gaUrl = `https://sendapp.link/t/${document.location.href.replace(/http(s)?:\/\//, '')}`;

  const frame = document.createElement('iframe');
  frame.width = 1;
  frame.height = 1;
  frame.style.width = 1;
  frame.style.height = 1;
  frame.style.position = 'absolute';
  frame.style.top = '-100px';
  frame.style.left = '-100px';
  frame.src = gaUrl;

  document.body.appendChild(frame);
}

function trackReferrer() {
  const ref = docCookies.getItem(`${cookieName}.R`);

  if (typeof ref !== 'string') {
    const se = {
      ref: document.referrer,
      entry: document.location.href,
    };
    const data = Base64.btoa(JSON.stringify(se));
    docCookies.setItem(`${cookieName}.R`, data);
  }
}

function detectOs() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const winphone = /windows phone/i.test(userAgent);
  const android = /android/i.test(userAgent);
  const ios = (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream);
  const safari = /safari/i.test(userAgent);

  return {
    android,
    ios,
    winphone,
    desktop: !(android || ios || winphone),
    safari,
    nativeAppBar: ios && safari && document.querySelector('meta[name="apple-itunes-app"]'),
  };
}

function detectLang() {
  return window.navigator.language.split('-').shift();
}

function getLocale(lang) {
  if (locales[lang]) {
    return { ...locales.en, ...locales[lang] };
  }

  return locales.en;
}

function getDismissed() {
  if (docCookies.getItem(`${cookieName}.Dismissed`)) {
    return true;
  }

  if (window.localStorage.getItem(`${cookieName}.Dismissed`)) {
    return true;
  }

  return false;
}

function saveDismissed() {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  docCookies.setItem(`${cookieName}.Dismissed`, true, expires);

  window.localStorage.setItem(`${cookieName}.Dismissed`, expires.getTime());
}

function loadCountryCode() {
  const saved = window.sessionStorage.getItem(`${cookieName}.CountryCode`);
  if (saved) {
    return new Promise(done => done(saved));
  }

  return fetch('https://location.ombori.com/')
    .then(resp => resp.json())
    .then((data) => {
      sessionStorage.setItem(`${cookieName}.CountryCode`, data.country);
      return data.country;
    });
}

function sendSMS(number, app) {
  const se = docCookies.getItem(`${cookieName}.R`);
  const session = (se) ? JSON.parse(Base64.atob(se)) : {};

  const data = {
    number,
    url: document.location.href,
    session,
    context: 'desktop',
    secure: true,
    apple: app.apple,
    google: app.google, // FIXME: maybe send only ids?
  };

  return fetch('https://sendapp.link/links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }).then((resp) => {
    if (resp.status !== 200) {
      return new Promise().reject(`sendapp returned ${resp.status}`);
    }

    return true;
  });
}

function loadInfo(appleId, googleId) {
  const url = `https://sendapp.link/data?apple=${appleId}&google=${googleId}`;
  return fetch(url)
    .then(resp => resp.json());
}

// FIXME this should be the part of main fn
function onDismiss() {
  saveDismissed();
}

export default class AppBanner extends Component {
  constructor(props) {
    super(props);

    this.os = null;
    this.locale = null;

    this.state = {
      app: null,
    };
  }

  componentWillMount() {
    const os = detectOs();
    this.os = os;

    const lang = detectLang();
    this.locale = getLocale(lang);

    trackView();
    trackReferrer();

    if (getDismissed()) {
      return;
    }

    // Do not show if on iOS and the native app baner is specified
    if (os.nativeAppBar) {
      return; // TODO: remove the native app banner
    }

    this.load();
  }

  load() {
    const { apple, google } = this.props;
    const { os } = this;

    loadInfo(apple, google)
      .then((app) => {
        if (os.desktop) {
          loadCountryCode()
            .then(country => this.setState({ country, app }));
        } else {
          this.setState({ app });
        }
      });
  }

  render() {
    const { app, country } = this.state;
    const { os, locale } = this;
    const { placement, p } = this.props; // props.p is a shorthand for props.placement

    if (!app) {
      return null;
    }

    // dirty fix for apple icons -- they are not https, this breaks https website security
    if (app.apple) {
      if (app.google) {
        app.apple.icon = app.google.icon; // use google icon, they're always https
      }
    }

    if (os.desktop) {
      return (
        <Desktop
          google={app.google}
          apple={app.apple}
          locale={locale}
          sender={number => sendSMS(number, app)}
          country={country}
          placement={placement || p}
          onDismiss={() => onDismiss()}
        />
      );
    }

    if (os.ios) {
      locale.cta = locale.get_apple;
      return (
        <Mobile
          app={app.apple}
          locale={locale}
          onDismiss={() => onDismiss()}
        />
      );
    }

    if (os.android) {
      locale.cta = locale.get_google;
      return (
        <Mobile
          app={app.google}
          locale={locale}
          onDismiss={() => onDismiss()}
        />
      );
    }

    return null;
  }
}
