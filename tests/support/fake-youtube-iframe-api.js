// Minimal stand-in for https://www.youtube.com/iframe_api, injected by E2E tests
// via request interception. It mimics the official event contract
// (onReady, onStateChange with -1/0/1/2/3/5, onError) with a fake clock.
// Video "DDDDDDDDDDD" fails like an embedding-disabled video (error 150).
(function () {
  var STATES = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  function Player(el, opts) {
    var self = this;
    self.opts = opts;
    self.state = -1;
    self.base = 0;
    self.startedAt = 0;
    self.videoId = null;
    self.el = document.createElement("div");
    self.el.setAttribute("data-testid", "fake-yt-iframe");
    self.el.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:bold 16px sans-serif;background:#111";
    el.replaceWith(self.el);
    window.__fakeYT = self;
    setTimeout(function () {
      opts.events && opts.events.onReady && opts.events.onReady({ target: self });
    }, 50);
  }
  Player.prototype._emit = function (s) {
    this.state = s;
    this.el.textContent = "FAKE YT " + this.videoId + " state " + s;
    this.el.setAttribute("data-state", String(s));
    this.opts.events && this.opts.events.onStateChange && this.opts.events.onStateChange({ data: s, target: this });
  };
  Player.prototype.cueVideoById = function (o) {
    this.videoId = o.videoId;
    this.base = o.startSeconds || 0;
    this._emit(5);
  };
  Player.prototype.loadVideoById = function (o) {
    this.videoId = o.videoId;
    this.base = o.startSeconds || 0;
    this.playVideo();
  };
  Player.prototype.playVideo = function () {
    var self = this;
    if (self.videoId === "DDDDDDDDDDD") {
      setTimeout(function () {
        self.opts.events.onError({ data: 150 });
      }, 30);
      return;
    }
    self.startedAt = performance.now();
    self._emit(3);
    setTimeout(function () {
      self.startedAt = performance.now();
      self._emit(1);
    }, 60);
    clearInterval(self.timer);
    self.timer = setInterval(function () {
      if (self.state === 1 && self.getCurrentTime() >= self.getDuration()) {
        clearInterval(self.timer);
        self.base = self.getDuration();
        self._emit(0);
      }
    }, 100);
  };
  Player.prototype.pauseVideo = function () {
    if (this.state !== 1) return;
    this.base = this.getCurrentTime();
    this._emit(2);
  };
  Player.prototype.stopVideo = Player.prototype.pauseVideo;
  Player.prototype.seekTo = function (s) {
    this.base = s;
    this.startedAt = performance.now();
  };
  Player.prototype.getCurrentTime = function () {
    return this.state === 1 ? Math.min(this.getDuration(), this.base + (performance.now() - this.startedAt) / 1000) : this.base;
  };
  Player.prototype.getDuration = function () {
    return 30;
  };
  Player.prototype.getPlayerState = function () {
    return this.state;
  };
  Player.prototype.destroy = function () {
    clearInterval(this.timer);
  };
  window.YT = { Player: Player, PlayerState: STATES };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
