(function(){
  const cache = {};
  let currentLocale = 'en';

  function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  }

  async function loadLocale(locale) {
    try {
      // Path relative to the public folder - works from views subfolder
      const res = await fetch(`../locales/${locale}.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
  cache[locale] = await res.json();
  currentLocale = locale;
  // Set document direction for RTL languages
  const rtlLocales = new Set(['ar']);
  const dir = rtlLocales.has(locale) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  // Optional body class for targeted styling
  document.body.classList.toggle('rtl', dir === 'rtl');
  applyDomTranslations();
    } catch (e) {
      if (locale !== 'en') {
        console.warn('[i18n] Failed to load locale', locale, e.message, 'falling back to en');
        return loadLocale('en');
      }
      console.error('[i18n] Failed to load fallback locale en:', e.message);
    }
  }

  function t(key, vars) {
    const dict = cache[currentLocale] || {};
    let val = dict[key];
    if (!val) {
      // fallback to en
      val = (cache['en'] || {})[key] || key;
    }
    return interpolate(val, vars);
  }

  function applyDomTranslations(root=document) {
    // Elements with data-i18n attribute (text content)
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    // Elements with data-i18n-placeholder for placeholders
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
  }

  window.i18n = { loadLocale, t, applyDomTranslations };
})();
