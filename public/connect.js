/*!
 * 180news site connector.
 *
 * Add this file to the 180news site with one line inside <head>:
 *   <script async src="https://YOUR-CMS-ADDRESS/connect.js"></script>
 *
 * The site keeps its stories, settings and adverts in the browser's storage and
 * redraws itself when that storage changes. This script fills that storage from
 * the Newsroom CMS, in the site's own format, so every reader sees what the
 * newsroom publishes. It changes nothing else about the site.
 */
(function () {
  'use strict';
  if (window.__newsroomCms) return;
  window.__newsroomCms = true;

  var tag = document.currentScript || document.querySelector('script[src*="/connect.js"]');
  var CMS;
  try {
    CMS = new URL(tag.src, location.href).origin;
  } catch (e) {
    return;
  }

  var KEYS = { articles: '180news:articles:v1', control: '180news:control:v1', ads: '180news:ads:v1', state: '180news:cms:v1' };
  var SECTIONS = ['elections', 'south-africa', 'politics', 'business', 'sport', 'world', 'africa', 'tech', 'life', 'opinion'];
  var AD_SLOTS = ['home', 'article', 'header', 'banner'];
  var MAX_STORIES = 50; // the most the site keeps
  var POLL_MS = 60000;
  // Pictures are stored inside the page's storage, so they are kept small: [longest side, quality].
  var TIERS = [[1000, 0.76], [720, 0.7], [420, 0.62]];
  var STORY_IMAGE_LIMIT = 680000; // the site ignores a story picture above 700 000 characters
  var AD_IMAGE_LIMIT = 860000; // and an advert image above 900 000

  var busy = false;
  var lastSync = 0;
  var pauseUntil = 0;
  var clipsById = {};
  var firstParagraph = {};

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Tells the site to read its storage again. It listens for exactly this event. */
  function redraw() {
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    } catch (e) {
      /* very old browser: the next page load picks the changes up */
    }
  }

  var isOurs = function (a) {
    return a && typeof a.id === 'string' && a.id.indexOf('my-cms') === 0;
  };
  var storyId = function (n) {
    return 'my-cms' + ('0000000' + n).slice(-7);
  };

  /* What this script last wrote. If the stored copy no longer matches, it is written again. */
  function articleSig(list) {
    return (Array.isArray(list) ? list : [])
      .filter(isOurs)
      .map(function (a) {
        return [a.id, a.updatedAt, a.pinned ? 1 : 0, a.headline ? 1 : 0, a.hidden ? 1 : 0, a.image ? 1 : 0].join(':');
      })
      .join('|');
  }
  function controlSig(c) {
    c = c && typeof c === 'object' ? c : {};
    return JSON.stringify([c.crawlEnabled, c.crawlSpeed, c.crawlMessage, c.showScheduled, c.adsOn, c.hiddenSections]);
  }
  function adsSig(ads) {
    ads = ads && typeof ads === 'object' ? ads : {};
    return AD_SLOTS.map(function (slot) {
      var a = ads[slot] || {};
      return [a.enabled !== false ? 1 : 0, a.position, a.name, a.url, a.image ? a.image.length : 0].join(':');
    }).join('|');
  }
  function intact(state) {
    return (
      state.articleSig === articleSig(read(KEYS.articles)) &&
      state.controlSig === controlSig(read(KEYS.control)) &&
      state.adsSig === adsSig(read(KEYS.ads))
    );
  }

  function loadBitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  /** Downloads a picture and returns a small copy as a data URL, the only form the site stores. */
  async function shrink(url, longest, quality, limit, keepPng) {
    var res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('image ' + res.status);
    var blob = await res.blob();
    var bitmap = await loadBitmap(blob);
    var type = keepPng && blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    var out = null;
    for (var attempt = 0; attempt < 5; attempt++) {
      var scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var ctx = canvas.getContext('2d');
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      out = { data: canvas.toDataURL(type, quality), w: canvas.width, h: canvas.height };
      if (out.data.length <= limit) break;
      longest = Math.round(longest * 0.72);
      out = null;
    }
    if (bitmap.close) bitmap.close();
    if (!out) throw new Error('image too large');
    return out;
  }

  function remember(list, clips) {
    clipsById = clips || {};
    firstParagraph = {};
    (Array.isArray(list) ? list : []).filter(isOurs).forEach(function (a) {
      firstParagraph[a.id] = String(a.body || '').split(/\n\s*\n/)[0].trim();
    });
  }

  async function apply(feed, state) {
    var previous = read(KEYS.articles);
    previous = Array.isArray(previous) ? previous : [];
    var before = {};
    previous.forEach(function (a) {
      if (a && a.id) before[a.id] = a;
    });
    // Anything written in the site's own Admin page on this device is left alone. It is read again
    // at every write, so an article saved there while pictures are still loading is not lost.
    function deviceArticles() {
      var now = read(KEYS.articles);
      return (Array.isArray(now) ? now : []).filter(function (a) {
        return a && !isOurs(a);
      });
    }
    var local = deviceArticles();

    var hidden = (feed.settings.hiddenSections || []).filter(function (s) {
      return SECTIONS.indexOf(s) >= 0;
    });
    var open = SECTIONS.filter(function (s) {
      return hidden.indexOf(s) < 0;
    });
    // A category the site has no page for is filed under South Africa (or the first section that is on).
    var fallback = open.indexOf('south-africa') >= 0 || !open.length ? 'south-africa' : open[0];

    var oldImages = state.images || {};
    var images = {};
    var clips = {};
    var todo = [];
    var list = feed.stories.slice(0, Math.max(0, MAX_STORIES - local.length)).map(function (s, index) {
      var id = storyId(s.n);
      var a = {
        id: id,
        title: s.title,
        summary: s.summary || '',
        body: s.body,
        author: s.author,
        section: SECTIONS.indexOf(s.section) >= 0 ? s.section : fallback,
        createdAt: s.publishedAt,
        updatedAt: s.updatedAt,
        hidden: false,
        pinned: !!s.pinned,
        headline: !!s.headline,
      };
      if (s.links && s.links.length) a.links = s.links;
      if (s.tags && s.tags.length) a.tags = s.tags;
      if (s.clips && s.clips.length) clips[id] = s.clips;
      var tier = s.pinned ? 0 : index < 8 ? 1 : index < 20 ? 2 : -1;
      if (s.image && tier >= 0) {
        var sig = s.image + '|' + tier;
        if (oldImages[id] === sig && before[id] && before[id].image) {
          a.image = before[id].image;
          images[id] = sig;
        } else {
          todo.push({ article: a, url: s.image, tier: tier, sig: sig });
        }
      }
      return a;
    });

    var full = false;
    function commit() {
      for (;;) {
        if (write(KEYS.articles, list.concat(deviceArticles()))) return true;
        // Out of room: let go of the picture on the oldest story that has one, and try again.
        full = true;
        var k = -1;
        for (var i = list.length - 1; i >= 0; i--) {
          if (list[i].image) {
            k = i;
            break;
          }
        }
        if (k < 0) return false;
        delete list[k].image;
        delete images[list[k].id];
      }
    }

    /* Settings: only what the CMS manages is changed. */
    var control = read(KEYS.control);
    control = control && typeof control === 'object' ? control : {};
    var s = feed.settings;
    control.crawlEnabled = s.crawlEnabled;
    control.crawlSpeed = s.crawlSpeed;
    control.crawlMessage = s.crawlMessage || '';
    control.showScheduled = s.showScheduled;
    control.adsOn = s.adsOn;
    control.hiddenSections = hidden;
    if (s.email) control.email = s.email;
    if (s.phone) control.phone = s.phone;
    if (s.adPhone) control.adPhone = s.adPhone;

    /* Adverts. A slot with no image in the CMS keeps the site's own "Your advert here" panel. */
    var oldAds = read(KEYS.ads);
    oldAds = oldAds && typeof oldAds === 'object' ? oldAds : {};
    var oldAdImages = state.adImages || {};
    var adImages = {};
    var ads = {};
    var adTodo = [];
    AD_SLOTS.forEach(function (slot) {
      var f = (feed.ads && feed.ads[slot]) || {};
      var ad = { enabled: f.image ? !!f.enabled : true, position: f.position, name: f.name || '', url: f.url || '' };
      if (f.image) {
        var was = oldAds[slot];
        if (oldAdImages[slot] === f.image && was && was.image) {
          ad.image = was.image;
          ad.w = was.w;
          ad.h = was.h;
          adImages[slot] = f.image;
        } else {
          // Until its image is ready, an advert that is switched on stays hidden rather than showing the house panel.
          ad.enabled = false;
          adTodo.push({ slot: slot, url: f.image, enabled: !!f.enabled });
        }
      }
      ads[slot] = ad;
    });

    function save(done) {
      var ok = commit();
      write(KEYS.control, control);
      write(KEYS.ads, ads);
      remember(list, clips);
      if (!ok) {
        pauseUntil = Date.now() + 10 * 60000;
        return false;
      }
      write(KEYS.state, {
        // The version is only kept once every picture is in place, so an interrupted visit carries on next time.
        version: done ? feed.version : '',
        at: Date.now(),
        images: images,
        adImages: adImages,
        clips: clips,
        articleSig: articleSig(list),
        controlSig: controlSig(control),
        adsSig: adsSig(ads),
      });
      redraw();
      placeClips();
      return true;
    }

    // Words first, so the stories are on the page straight away. Pictures follow.
    if (!save(!todo.length && !adTodo.length)) return;
    if (!todo.length && !adTodo.length) return;

    for (var i = 0; i < adTodo.length; i++) {
      try {
        var made = await shrink(adTodo[i].url, 1200, 0.86, AD_IMAGE_LIMIT, true);
        var slot = adTodo[i].slot;
        ads[slot].image = made.data;
        ads[slot].w = made.w;
        ads[slot].h = made.h;
        ads[slot].enabled = adTodo[i].enabled;
        adImages[slot] = adTodo[i].url;
      } catch (e) {
        /* the advert stays hidden; it is tried again on the next change */
      }
    }
    if (adTodo.length && !save(!todo.length)) return;

    for (var j = 0; j < todo.length && !full; j++) {
      var job = todo[j];
      try {
        var picture = await shrink(job.url, TIERS[job.tier][0], TIERS[job.tier][1], STORY_IMAGE_LIMIT, false);
        job.article.image = picture.data;
        images[job.article.id] = job.sig;
      } catch (e) {
        images[job.article.id] = job.sig + '|failed';
      }
      var last = j === todo.length - 1;
      if ((j < 3 || j % 4 === 3 || last) && !save(last)) return;
    }
    if (full) save(true);
  }

  async function sync(force) {
    if (busy || Date.now() < pauseUntil) return;
    busy = true;
    lastSync = Date.now();
    try {
      var state = read(KEYS.state) || {};
      var known = !force && state.version && intact(state) ? state.version : '';
      var res = await fetch(CMS + '/api/public?resource=site' + (known ? '&v=' + encodeURIComponent(known) : ''), { credentials: 'omit' });
      if (!res.ok) return;
      var feed = await res.json();
      if (feed && !feed.unchanged && Array.isArray(feed.stories) && feed.settings) await apply(feed, state);
    } catch (e) {
      /* offline, or the CMS is unreachable: the site carries on with what it has */
    } finally {
      busy = false;
    }
  }

  /* ---------------------------------------------------------------------- *
   * Short videos and audio clips. YouTube videos use the site's own player; *
   * uploaded clips are streamed from the CMS in a player placed beside the  *
   * story text, so nothing is downloaded until the reader presses play.     *
   * ---------------------------------------------------------------------- */

  function currentStory() {
    var m = /^\/story\/(my-cms\d+)\/?$/.exec(location.pathname);
    return m ? m[1] : null;
  }

  function el(name, style, text) {
    var node = document.createElement(name);
    if (style) node.style.cssText = style;
    if (text) node.textContent = text;
    return node;
  }

  function buildClips(clips, position, sig) {
    var wrap = el('section', 'margin-top:24px;max-width:64ch;font-size:18px');
    wrap.setAttribute('data-cms-clips', position);
    wrap.setAttribute('data-sig', sig);
    clips.forEach(function (clip, index) {
      var audio = clip.kind === 'audio';
      var portrait = !audio && clip.width && clip.height && clip.height > clip.width;
      var figure = el(
        'figure',
        'margin:' + (index ? '24px' : '0') + ' 0 0;' + (audio ? 'border-left:4px solid #030689;background:#eef0fb;padding:16px 20px;' : '') + (portrait ? 'max-width:340px;' : ''),
      );
      if (audio) {
        figure.appendChild(el('div', 'font-size:12.5px;line-height:1.3;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#030689', 'Listen'));
        if (clip.title) figure.appendChild(el('div', 'margin-top:4px;font-size:17px;line-height:1.3;font-weight:800;color:#14161b', clip.title));
      }
      var player = el(audio ? 'audio' : 'video', audio ? 'display:block;width:100%;margin-top:12px' : 'display:block;width:100%;max-height:82vh;background:#14161b');
      player.controls = true;
      player.preload = audio ? 'none' : 'metadata';
      if (!audio) {
        player.playsInline = true;
        player.setAttribute('playsinline', '');
        if (clip.width && clip.height) player.style.aspectRatio = clip.width + ' / ' + clip.height;
      }
      if (clip.title) player.setAttribute('aria-label', clip.title);
      player.src = clip.url;
      figure.appendChild(player);

      var notes = [];
      if (clip.caption) notes.push(clip.caption);
      if (clip.credit) notes.push((audio ? 'Audio: ' : 'Video: ') + clip.credit);
      if ((!audio && clip.title) || notes.length) {
        var caption = el('figcaption', 'margin-top:8px;font-size:13px;line-height:1.5;color:#5a616d');
        if (!audio && clip.title) {
          caption.appendChild(el('strong', 'font-weight:700;color:#14161b', clip.title));
          if (notes.length) caption.appendChild(document.createTextNode(' \u00b7 '));
        }
        caption.appendChild(document.createTextNode(notes.join(' \u00b7 ')));
        figure.appendChild(caption);
      }
      wrap.appendChild(figure);
    });
    return wrap;
  }

  /** Puts the players beside the story text, and takes them away on any other page. Safe to call often. */
  function placeClips() {
    var id = currentStory();
    var clips = id ? clipsById[id] : null;
    var first = id ? firstParagraph[id] : '';
    var body = null;
    if (clips && clips.length && first) {
      var paragraphs = document.querySelectorAll('article p');
      for (var i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].textContent.trim() === first) {
          body = paragraphs[i].parentElement;
          break;
        }
      }
    }
    var placed = document.querySelectorAll('[data-cms-clips]');
    if (!body || !body.parentElement) {
      for (var p = 0; p < placed.length; p++) placed[p].remove();
      return;
    }
    ['before', 'after'].forEach(function (position) {
      var mine = clips.filter(function (c) {
        return (c.position === 'after' ? 'after' : 'before') === position;
      });
      var sig = id + '|' + mine.map(function (c) { return c.url + c.title + c.caption + c.credit; }).join('|');
      var node = null;
      for (var k = 0; k < placed.length; k++) {
        if (placed[k].getAttribute('data-cms-clips') === position) node = placed[k];
      }
      if (node && mine.length && node.getAttribute('data-sig') === sig && node.parentElement === body.parentElement) return;
      if (node) node.remove();
      if (!mine.length) return;
      body.parentElement.insertBefore(buildClips(mine, position, sig), position === 'before' ? body : body.nextSibling);
    });
  }

  /* Read counts for the dashboard and analytics: one per story per visit. */
  var counted = null;
  function countRead() {
    var id = currentStory();
    if (!id) {
      counted = null;
      return;
    }
    if (id === counted) return;
    counted = id;
    var n = parseInt(id.slice(6), 10);
    try {
      var seen = JSON.parse(sessionStorage.getItem('180news:cms:read') || '[]');
      if (seen.indexOf(n) >= 0) return;
      seen.push(n);
      sessionStorage.setItem('180news:cms:read', JSON.stringify(seen.slice(-200)));
    } catch (e) {
      /* private mode: count it anyway */
    }
    fetch(CMS + '/api/public?resource=view&id=' + n, { credentials: 'omit', keepalive: true }).catch(function () {});
  }

  var timer = null;
  function onPageChange() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      countRead();
      placeClips();
    }, 120);
  }

  function start() {
    // This file is for the news app. On a page of the CMS itself it does nothing.
    if (document.querySelector('meta[name="newsroom-cms"]') || /Newsroom CMS/i.test(document.title)) return;
    var state = read(KEYS.state) || {};
    remember(read(KEYS.articles), state.clips);
    sync(false);
    // The site may still be starting up; a second nudge makes sure it has seen the first write.
    setTimeout(redraw, 1500);
    new MutationObserver(onPageChange).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', onPageChange);
    onPageChange();
    setInterval(function () {
      if (document.visibilityState === 'visible') sync(false);
    }, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - lastSync > 15000) sync(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
