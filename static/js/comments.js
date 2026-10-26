/* 评论系统
 * ------------------------------------------------------------------
 * 用 utterances 或 giscus，两者都把评论存在 GitHub 上：
 *   · utterances -> 仓库的 Issues
 *   · giscus     -> 仓库的 Discussions
 *
 * 这意味着：清空 dist/、重新部署、换电脑都不会丢评论，
 * 因为评论压根不在静态站点里，而在 GitHub 仓库里。
 *
 * 加载策略（v2.1）：
 *   1. 滚动到附近才加载，省流量
 *   2. 挂载前先清掉"正在加载评论…"占位文字
 *   3. 10 秒内没出现 iframe 就显示可操作的失败提示（附 GitHub Issues 直链 + 重试按钮）
 *      —— 常见原因是没装 App、仓库是私有的，或者所在网络访问不了 utteranc.es
 */
(function () {
  'use strict';

  var config = (window.__BLOG__ && window.__BLOG__.comments) || { provider: 'none' };
  var mount = document.getElementById('comments-mount');
  if (!mount) return;

  var provider = config.provider || 'none';
  var loaded = false;
  var observer = null;
  var pollTimer = null;
  var mountedAt = 0;

  var LOAD_TIMEOUT = 10000;

  /* ---------- 主题 ---------- */
  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  /* ---------- 链接 ---------- */
  function issuesUrl() {
    if (!config.repo) return 'https://github.com';
    return 'https://github.com/' + config.repo + '/issues';
  }

  function appUrl() {
    return provider === 'giscus'
      ? 'https://github.com/apps/giscus'
      : 'https://github.com/apps/utterances';
  }

  function wikiUrl() {
    return provider === 'giscus' ? 'https://giscus.app' : 'https://utteranc.es';
  }

  /* ---------- 各种提示面板 ---------- */
  function panel(title, items, actions) {
    var html = '<div class="comments__setup"><strong>' + title + '</strong>';
    if (items && items.length) {
      html += '<ol>';
      for (var i = 0; i < items.length; i += 1) {
        html += '<li>' + items[i] + '</li>';
      }
      html += '</ol>';
    }
    if (actions) {
      html += '<p style="margin:1rem 0 0;display:flex;gap:.5rem;flex-wrap:wrap">' + actions + '</p>';
    }
    html += '</div>';
    mount.innerHTML = html;
  }

  function bindRetry() {
    var btn = mount.querySelector('[data-comments-retry]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      loaded = false;
      mountNow();
    });
  }

  function showUnconfigured() {
    panel(
      '评论系统还没配置。',
      [
        '仓库必须是公开的：<code>' + (config.repo || '还没填 comments.repo') + '</code>',
        '安装 <a href="' + appUrl() + '" target="_blank" rel="noopener">' + provider + ' App</a>，选中这个仓库',
        '把仓库名填进 <code>blog.config.json</code> 的 <code>comments.repo</code>，重新构建'
      ]
    );
  }

  function showFailure(reason) {
    var items = [
      '确认 <code>' + config.repo + '</code> 已安装 <a href="' + appUrl() + '" target="_blank" rel="noopener">' + provider + ' App</a>，且仓库是 <strong>Public</strong>。',
      '如果网络访问不了 <code>' + wikiUrl().replace('https://', '') + '</code>（部分地区会被拦），评论框就加载不出来 —— 这种情况可以直接去 GitHub 留言。',
      '改动配置后需要重新构建：<code>python -m blog build</code>'
    ];
    var actions =
      '<a class="button button--primary" href="' + issuesUrl() + '" target="_blank" rel="noopener">去 GitHub Issues 留言</a>' +
      '<button class="button" type="button" data-comments-retry>重试加载</button>';
    panel('评论框没能加载出来' + (reason ? '（' + reason + '）' : '') + '。', items, actions);
    bindRetry();
  }

  /* ---------- 挂载 ---------- */
  function clearMount() {
    var olds = mount.querySelectorAll('iframe, script');
    for (var i = 0; i < olds.length; i += 1) {
      olds[i].parentNode.removeChild(olds[i]);
    }
    mount.innerHTML = '';   // 关键：清掉"正在加载评论…"占位文字
    mountedAt = Date.now();
  }

  function watchForFrame() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(function () {
      if (mount.querySelector('iframe')) {
        window.clearInterval(pollTimer);
        pollTimer = null;
        return;
      }
      if (Date.now() - mountedAt > LOAD_TIMEOUT) {
        window.clearInterval(pollTimer);
        pollTimer = null;
        showFailure('');
      }
    }, 400);
  }

  function loadUtterances() {
    clearMount();
    var script = document.createElement('script');
    script.src = 'https://utteranc.es/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('repo', config.repo);
    script.setAttribute('issue-term', config.issue_term || config.mapping || 'pathname');
    script.setAttribute('label', config.label || 'comment');
    script.setAttribute('theme', currentTheme() === 'dark' ? 'github-dark' : 'github-light');
    script.onerror = function () { showFailure('脚本加载失败'); };
    mount.appendChild(script);
    watchForFrame();
  }

  function loadGiscus() {
    clearMount();
    var script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-repo', config.repo);
    script.setAttribute('data-repo-id', config.repo_id);
    script.setAttribute('data-category', config.category || 'Announcements');
    script.setAttribute('data-category-id', config.category_id);
    script.setAttribute('data-mapping', config.mapping || 'pathname');
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', config.reactions_enabled === false ? '0' : '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', config.input_position || 'top');
    script.setAttribute('data-theme', currentTheme() === 'dark' ? 'dark' : 'light');
    script.setAttribute('data-lang', 'zh-CN');
    script.setAttribute('data-loading', 'lazy');
    script.onerror = function () { showFailure('脚本加载失败'); };
    mount.appendChild(script);
    watchForFrame();
  }

  function mountNow() {
    if (loaded) return;
    loaded = true;
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (provider === 'utterances') loadUtterances();
    else if (provider === 'giscus') loadGiscus();
  }

  /* ---------- 启动 ---------- */
  if (provider === 'none') {
    mount.innerHTML = '<p class="comments__empty">评论功能已关闭。</p>';
    return;
  }

  if (provider === 'unconfigured' || !config.repo) {
    showUnconfigured();
    return;
  }

  var lazy = config.lazy !== false;
  if (lazy && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        observer = null;
        mountNow();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(mount);
  } else {
    mountNow();
  }

  /* ---------- 跟随主题 ---------- */
  window.addEventListener('blog:theme', function () {
    if (!loaded) return;
    if (provider === 'giscus') {
      var frame = document.querySelector('iframe.giscus-frame');
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage(
          { giscus: { setConfig: { theme: currentTheme() } } },
          'https://giscus.app'
        );
        return;
      }
      loaded = false;
      mountNow();
    } else {
      loaded = false;
      mountNow();
    }
  });
})();