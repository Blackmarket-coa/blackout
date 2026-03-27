import p, { useState as Se, useEffect as on, useMemo as at, useSyncExternalStore as wh, forwardRef as U, createContext as Eh, useContext as Sh, useId as To, version as Th, useRef as gt, Children as Ah, useCallback as fe, memo as Mf } from "react";
import { IconButton as ut, Button as Fe, Tooltip as Ih, InlineSpinner as Oh, Text as Mt, Badge as ii, Menu as Nn, MenuTitle as Bc, RadioMenuItem as ai, CheckboxMenuItem as jh, MenuItem as ae, H1 as Ph, ChatFilter as kh, UnreadCounter as Rh, Unread as Mh, ToggleMenuItem as Fc, Separator as Ch, ContextMenu as xh } from "@vector-im/compound-web";
import { Virtuoso as Nh } from "react-virtuoso";
import { VirtuosoMockContext as u5 } from "react-virtuoso";
class zh {
  disposables = [];
  _isDisposed = !1;
  /**
   * Relinquish all tracked disposable values
   */
  dispose() {
    if (!this.isDisposed) {
      this._isDisposed = !0;
      for (const t of this.disposables)
        typeof t == "function" ? t() : t.dispose();
    }
  }
  /**
   * Track a value that needs to be eventually relinquished
   */
  track(t) {
    return this.throwIfDisposed(), this.disposables.push(t), t;
  }
  /**
   * Add an event listener that will be removed on dispose
   */
  trackListener(t, n, r) {
    this.throwIfDisposed(), t.on(n, r), this.track(() => {
      t.off(n, r);
    });
  }
  throwIfDisposed() {
    if (this.isDisposed) throw new Error("Disposable is already disposed");
  }
  /**
   * Whether this disposable has been disposed
   */
  get isDisposed() {
    return this._isDisposed;
  }
}
class Bh {
  constructor(t, n) {
    this.snapshot = t, this.emit = n;
  }
  /**
   * Replace current snapshot with a new snapshot value.
   * @param snapshot New snapshot value
   */
  set(t) {
    this.snapshot = t, this.emit();
  }
  /**
   * Update a part of the current snapshot by merging into the existing snapshot.
   * @param snapshot A subset of the snapshot to merge into the current snapshot.
   */
  merge(t) {
    this.snapshot = { ...this.snapshot, ...t }, this.emit();
  }
  /**
   * The current value of the snapshot.
   */
  get current() {
    return this.snapshot;
  }
}
class Fh {
  listeners = /* @__PURE__ */ new Set();
  /**
   * Subscribe to changes in the view model.
   * @param listener Will be called whenever the snapshot changes.
   * @returns A function to unsubscribe from the view model updates.
   */
  add = (t) => (this.listeners.add(t), () => {
    this.listeners.delete(t);
  });
  /**
   * Emit an update to all subscribed listeners.
   */
  emit = () => {
    for (const t of this.listeners)
      t();
  };
}
class O8 {
  subs;
  snapshot;
  props;
  disposables = new zh();
  constructor(t, n) {
    this.props = t, this.subs = new Fh(), this.snapshot = new Bh(n, () => {
      this.subs.emit();
    });
  }
  subscribe = (t) => this.subs.add(t);
  /**
   * Returns the current snapshot of the view model.
   */
  getSnapshot = () => this.snapshot.current;
  /**
   * Relinquish any resources held by this view-model.
   */
  dispose() {
    this.disposables.dispose();
  }
  /**
   * Whether this view-model has been disposed.
   */
  get isDisposed() {
    return this.disposables.isDisposed;
  }
}
class Dh {
  constructor(t) {
    this.snapshot = t;
  }
  getSnapshot = () => this.snapshot;
  subscribe(t) {
    return () => {
    };
  }
}
function j8(e) {
  const [t, n] = Se(e);
  return on(() => {
    let r = t;
    if (t.isDisposed) {
      const o = e();
      r = o, n(o);
    }
    return () => {
      r.dispose();
    };
  }, []), t;
}
function P8(e, t) {
  return at(() => {
    const n = new Dh(e);
    return Object.assign(n, t), n;
  }, [e, t]);
}
function ve(e) {
  return wh(e.subscribe, e.getSnapshot, e.getSnapshot);
}
var Cf = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function xf(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
var si = { exports: {} };
var Dc;
function Lh() {
  return Dc || (Dc = 1, (function(e) {
    (function() {
      var t = {}.hasOwnProperty;
      function n() {
        for (var i = "", a = 0; a < arguments.length; a++) {
          var s = arguments[a];
          s && (i = o(i, r(s)));
        }
        return i;
      }
      function r(i) {
        if (typeof i == "string" || typeof i == "number")
          return i;
        if (typeof i != "object")
          return "";
        if (Array.isArray(i))
          return n.apply(null, i);
        if (i.toString !== Object.prototype.toString && !i.toString.toString().includes("[native code]"))
          return i.toString();
        var a = "";
        for (var s in i)
          t.call(i, s) && i[s] && (a = o(a, s));
        return a;
      }
      function o(i, a) {
        return a ? i ? i + " " + a : i + a : i;
      }
      e.exports ? (n.default = n, e.exports = n) : window.classNames = n;
    })();
  })(si)), si.exports;
}
var qh = Lh();
const _e = /* @__PURE__ */ xf(qh), Hh = "_mediaBody_11o4b_8", Uh = {
  mediaBody: Hh
};
function $h({
  as: e,
  className: t,
  children: n,
  ...r
}) {
  const o = e || "div";
  return /* @__PURE__ */ p.createElement(o, { className: _e("mx_MediaBody", Uh.mediaBody, t), ...r }, n);
}
const Kh = "_flex_4dswl_9", Gh = {
  flex: Kh
};
function re({
  as: e = "div",
  display: t = "flex",
  direction: n = "row",
  align: r = "start",
  justify: o = "start",
  gap: i = "0",
  wrap: a = "nowrap",
  className: s,
  children: c,
  ...l
}) {
  const f = at(
    () => ({
      "--mx-flex-display": t,
      "--mx-flex-direction": n,
      "--mx-flex-align": r,
      "--mx-flex-justify": o,
      "--mx-flex-gap": i,
      "--mx-flex-wrap": a
    }),
    [r, n, t, i, o, a]
  );
  return p.createElement(e, { ...l, className: _e(Gh.flex, s), style: f }, c);
}
const Vh = "_audioPlayer_1ly1h_8", Yh = "_mediaInfo_1ly1h_12", Wh = "_mediaName_1ly1h_17", Zh = "_byline_1ly1h_26", Jh = "_clock_1ly1h_30", Xh = "_error_1ly1h_34", _n = {
  audioPlayer: Vh,
  mediaInfo: Yh,
  mediaName: Wh,
  byline: Zh,
  clock: Jh,
  error: Xh
};
var Hr = { exports: {} }, Jn = {};
var Lc;
function Qh() {
  if (Lc) return Jn;
  Lc = 1;
  var e = /* @__PURE__ */ Symbol.for("react.transitional.element"), t = /* @__PURE__ */ Symbol.for("react.fragment");
  function n(r, o, i) {
    var a = null;
    if (i !== void 0 && (a = "" + i), o.key !== void 0 && (a = "" + o.key), "key" in o) {
      i = {};
      for (var s in o)
        s !== "key" && (i[s] = o[s]);
    } else i = o;
    return o = i.ref, {
      $$typeof: e,
      type: r,
      key: a,
      ref: o !== void 0 ? o : null,
      props: i
    };
  }
  return Jn.Fragment = t, Jn.jsx = n, Jn.jsxs = n, Jn;
}
var Xn = {};
var qc;
function em() {
  return qc || (qc = 1, process.env.NODE_ENV !== "production" && (function() {
    function e(j) {
      if (j == null) return null;
      if (typeof j == "function")
        return j.$$typeof === q ? null : j.displayName || j.name || null;
      if (typeof j == "string") return j;
      switch (j) {
        case T:
          return "Fragment";
        case y:
          return "Profiler";
        case m:
          return "StrictMode";
        case E:
          return "Suspense";
        case I:
          return "SuspenseList";
        case x:
          return "Activity";
      }
      if (typeof j == "object")
        switch (typeof j.tag == "number" && console.error(
          "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
        ), j.$$typeof) {
          case g:
            return "Portal";
          case v:
            return j.displayName || "Context";
          case S:
            return (j._context.displayName || "Context") + ".Consumer";
          case _:
            var w = j.render;
            return j = j.displayName, j || (j = w.displayName || w.name || "", j = j !== "" ? "ForwardRef(" + j + ")" : "ForwardRef"), j;
          case k:
            return w = j.displayName || null, w !== null ? w : e(j.type) || "Memo";
          case M:
            w = j._payload, j = j._init;
            try {
              return e(j(w));
            } catch {
            }
        }
      return null;
    }
    function t(j) {
      return "" + j;
    }
    function n(j) {
      try {
        t(j);
        var w = !1;
      } catch {
        w = !0;
      }
      if (w) {
        w = console;
        var A = w.error, O = typeof Symbol == "function" && Symbol.toStringTag && j[Symbol.toStringTag] || j.constructor.name || "Object";
        return A.call(
          w,
          "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
          O
        ), t(j);
      }
    }
    function r(j) {
      if (j === T) return "<>";
      if (typeof j == "object" && j !== null && j.$$typeof === M)
        return "<...>";
      try {
        var w = e(j);
        return w ? "<" + w + ">" : "<...>";
      } catch {
        return "<...>";
      }
    }
    function o() {
      var j = V.A;
      return j === null ? null : j.getOwner();
    }
    function i() {
      return Error("react-stack-top-frame");
    }
    function a(j) {
      if (ie.call(j, "key")) {
        var w = Object.getOwnPropertyDescriptor(j, "key").get;
        if (w && w.isReactWarning) return !1;
      }
      return j.key !== void 0;
    }
    function s(j, w) {
      function A() {
        K || (K = !0, console.error(
          "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
          w
        ));
      }
      A.isReactWarning = !0, Object.defineProperty(j, "key", {
        get: A,
        configurable: !0
      });
    }
    function c() {
      var j = e(this.type);
      return W[j] || (W[j] = !0, console.error(
        "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
      )), j = this.props.ref, j !== void 0 ? j : null;
    }
    function l(j, w, A, O, B, $) {
      var z = A.ref;
      return j = {
        $$typeof: h,
        type: j,
        key: w,
        props: A,
        _owner: O
      }, (z !== void 0 ? z : null) !== null ? Object.defineProperty(j, "ref", {
        enumerable: !1,
        get: c
      }) : Object.defineProperty(j, "ref", { enumerable: !1, value: null }), j._store = {}, Object.defineProperty(j._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: 0
      }), Object.defineProperty(j, "_debugInfo", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: null
      }), Object.defineProperty(j, "_debugStack", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: B
      }), Object.defineProperty(j, "_debugTask", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: $
      }), Object.freeze && (Object.freeze(j.props), Object.freeze(j)), j;
    }
    function f(j, w, A, O, B, $) {
      var z = w.children;
      if (z !== void 0)
        if (O)
          if (ce(z)) {
            for (O = 0; O < z.length; O++)
              u(z[O]);
            Object.freeze && Object.freeze(z);
          } else
            console.error(
              "React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead."
            );
        else u(z);
      if (ie.call(w, "key")) {
        z = e(j);
        var L = Object.keys(w).filter(function(N) {
          return N !== "key";
        });
        O = 0 < L.length ? "{key: someKey, " + L.join(": ..., ") + ": ...}" : "{key: someKey}", pe[z + O] || (L = 0 < L.length ? "{" + L.join(": ..., ") + ": ...}" : "{}", console.error(
          `A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`,
          O,
          z,
          L,
          z
        ), pe[z + O] = !0);
      }
      if (z = null, A !== void 0 && (n(A), z = "" + A), a(w) && (n(w.key), z = "" + w.key), "key" in w) {
        A = {};
        for (var F in w)
          F !== "key" && (A[F] = w[F]);
      } else A = w;
      return z && s(
        A,
        typeof j == "function" ? j.displayName || j.name || "Unknown" : j
      ), l(
        j,
        z,
        A,
        o(),
        B,
        $
      );
    }
    function u(j) {
      d(j) ? j._store && (j._store.validated = 1) : typeof j == "object" && j !== null && j.$$typeof === M && (j._payload.status === "fulfilled" ? d(j._payload.value) && j._payload.value._store && (j._payload.value._store.validated = 1) : j._store && (j._store.validated = 1));
    }
    function d(j) {
      return typeof j == "object" && j !== null && j.$$typeof === h;
    }
    var b = p, h = /* @__PURE__ */ Symbol.for("react.transitional.element"), g = /* @__PURE__ */ Symbol.for("react.portal"), T = /* @__PURE__ */ Symbol.for("react.fragment"), m = /* @__PURE__ */ Symbol.for("react.strict_mode"), y = /* @__PURE__ */ Symbol.for("react.profiler"), S = /* @__PURE__ */ Symbol.for("react.consumer"), v = /* @__PURE__ */ Symbol.for("react.context"), _ = /* @__PURE__ */ Symbol.for("react.forward_ref"), E = /* @__PURE__ */ Symbol.for("react.suspense"), I = /* @__PURE__ */ Symbol.for("react.suspense_list"), k = /* @__PURE__ */ Symbol.for("react.memo"), M = /* @__PURE__ */ Symbol.for("react.lazy"), x = /* @__PURE__ */ Symbol.for("react.activity"), q = /* @__PURE__ */ Symbol.for("react.client.reference"), V = b.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, ie = Object.prototype.hasOwnProperty, ce = Array.isArray, D = console.createTask ? console.createTask : function() {
      return null;
    };
    b = {
      react_stack_bottom_frame: function(j) {
        return j();
      }
    };
    var K, W = {}, te = b.react_stack_bottom_frame.bind(
      b,
      i
    )(), le = D(r(i)), pe = {};
    Xn.Fragment = T, Xn.jsx = function(j, w, A) {
      var O = 1e4 > V.recentlyCreatedOwnerStacks++;
      return f(
        j,
        w,
        A,
        !1,
        O ? Error("react-stack-top-frame") : te,
        O ? D(r(j)) : le
      );
    }, Xn.jsxs = function(j, w, A) {
      var O = 1e4 > V.recentlyCreatedOwnerStacks++;
      return f(
        j,
        w,
        A,
        !0,
        O ? Error("react-stack-top-frame") : te,
        O ? D(r(j)) : le
      );
    };
  })()), Xn;
}
var Hc;
function tm() {
  return Hc || (Hc = 1, process.env.NODE_ENV === "production" ? Hr.exports = Qh() : Hr.exports = em()), Hr.exports;
}
var R = tm();
function Nf(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m8.98 4.677 9.921 5.58c1.36.764 1.36 2.722 0 3.486l-9.92 5.58C7.647 20.073 6 19.11 6 17.58V6.42c0-1.53 1.647-2.493 2.98-1.743"
    })
  });
}
Nf.displayName = "PlaySolidIcon";
const nm = U(Nf);
function zf(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M8 4a2 2 0 0 0-2 2v12a2 2 0 1 0 4 0V6a2 2 0 0 0-2-2m8 0a2 2 0 0 0-2 2v12a2 2 0 1 0 4 0V6a2 2 0 0 0-2-2"
    })
  });
}
zf.displayName = "PauseSolidIcon";
const rm = U(zf), om = "_button_yfjla_8", im = {
  button: om
}, Bf = Eh(null);
Bf.displayName = "I18nContext";
function Pe() {
  const e = Sh(Bf);
  if (!e)
    throw new Error("useI18n must be used within an I18nContext.Provider");
  return e;
}
function am({
  disabled: e = !1,
  playing: t = !1,
  togglePlay: n,
  ...r
}) {
  const { translate: o } = Pe(), i = o(t ? "action|pause" : "action|play");
  return /* @__PURE__ */ p.createElement(
    ut,
    {
      size: "32px",
      "aria-label": i,
      tooltip: i,
      onClick: n,
      className: im.button,
      disabled: e,
      ...r
    },
    t ? /* @__PURE__ */ p.createElement(rm, null) : /* @__PURE__ */ p.createElement(nm, null)
  );
}
function sm(e, t = 2) {
  if (e === 0) return "0 Bytes";
  const n = 1024, r = t < 0 ? 0 : t, o = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], i = Math.floor(Math.log(e) / Math.log(n));
  return parseFloat((e / Math.pow(n, i)).toFixed(r)) + " " + o[i];
}
function Ce(e, t, n, r, o) {
  return wt(t, ((i, a) => {
    const s = i[a];
    if (s === void 0)
      throw new TypeError(Us(a));
    return s;
  })(e, t), n, r, o);
}
function wt(e, t, n, r, o, i) {
  const a = ur(t, n, r);
  if (o && t !== a)
    throw new RangeError(Jd(e, t, n, r, i));
  return a;
}
function ke(e) {
  return e !== null && /object|function/.test(typeof e);
}
function Le(e, t = Map) {
  const n = new t();
  return (r, ...o) => {
    if (n.has(r))
      return n.get(r);
    const i = e(r, ...o);
    return n.set(r, i), i;
  };
}
function lr(e) {
  return kn({
    name: e
  }, 1);
}
function kn(e, t) {
  return Et(((n) => ({
    value: n,
    configurable: 1,
    writable: !t
  })), e);
}
function cm(e) {
  return Et(((t) => ({
    get: t,
    configurable: 1
  })), e);
}
function Za(e) {
  return {
    [Symbol.toStringTag]: {
      value: e,
      configurable: 1
    }
  };
}
function zn(e, t) {
  const n = {};
  let r = e.length;
  for (const o of t)
    n[e[--r]] = o;
  return n;
}
function Et(e, t, n) {
  const r = {};
  for (const o in t)
    r[o] = e(t[o], o, n);
  return r;
}
function Ao(e, t, n) {
  const r = {};
  for (let o = 0; o < t.length; o++) {
    const i = t[o];
    r[i] = e(i, o, n);
  }
  return r;
}
function Ff(e, t, n) {
  const r = {};
  for (let o = 0; o < e.length; o++)
    r[t[o]] = n[e[o]];
  return r;
}
function Ze(e, t) {
  const n = /* @__PURE__ */ Object.create(null);
  for (const r of e)
    n[r] = t[r];
  return n;
}
function Uc(e, t) {
  for (const n of t)
    if (n in e)
      return 1;
  return 0;
}
function Df(e, t, n) {
  for (const r of e)
    if (t[r] !== n[r])
      return 0;
  return 1;
}
function Lf(e, t, n) {
  const r = {
    ...n
  };
  for (let o = 0; o < t; o++)
    r[e[o]] = 0;
  return r;
}
function J(e, ...t) {
  return (...n) => e(...t, ...n);
}
function $c(e) {
  return e[0].toUpperCase() + e.substring(1);
}
function br(e) {
  return e.slice().sort();
}
function so(e, t) {
  return String(t).padStart(e, "0");
}
function Bt(e, t) {
  return Math.sign(e - t);
}
function ur(e, t, n) {
  return Math.min(Math.max(e, t), n);
}
function yt(e, t) {
  return [Math.floor(e / t), ar(e, t)];
}
function ar(e, t) {
  return (e % t + t) % t;
}
function Lt(e, t) {
  return [Io(e, t), Ja(e, t)];
}
function Io(e, t) {
  return Math.trunc(e / t) || 0;
}
function Ja(e, t) {
  return e % t || 0;
}
function Ur(e) {
  return Math.abs(e % 1) === 0.5;
}
function qf(e, t, n) {
  let r = 0, o = 0;
  for (let s = 0; s <= t; s++) {
    const c = e[n[s]], l = lt[s], f = se / l, [u, d] = Lt(c, f);
    r += d * l, o += u;
  }
  const [i, a] = Lt(r, se);
  return [o + i, a];
}
function Oo(e, t, n) {
  const r = {};
  for (let o = t; o >= 0; o--) {
    const i = lt[o];
    r[n[o]] = Io(e, i), e = Ja(e, i);
  }
  return r;
}
function lm(e) {
  if (e !== void 0)
    return Te(e);
}
function um(e) {
  if (e !== void 0)
    return mt(e);
}
function Hf(e) {
  if (e !== void 0)
    return Xa(e);
}
function mt(e) {
  return Kf(Xa(e));
}
function Xa(e) {
  return $f(_g(e));
}
function Uf(e, t) {
  if (t == null)
    throw new RangeError(Us(e));
  return t;
}
function _r(e) {
  if (!ke(e))
    throw new TypeError(K0);
  return e;
}
function Qa(e, t, n = e) {
  if (typeof t !== e)
    throw new TypeError(Jt(n, t));
  return t;
}
function $f(e, t = "number") {
  if (!Number.isInteger(e))
    throw new RangeError(D0(t, e));
  return e || 0;
}
function Kf(e, t = "number") {
  if (e <= 0)
    throw new RangeError(L0(t, e));
  return e;
}
function es(e) {
  if (typeof e == "symbol")
    throw new TypeError($0);
  return String(e);
}
function to(e, t) {
  return ke(e) ? String(e) : Te(e, t);
}
function ts(e) {
  if (typeof e == "string")
    return BigInt(e);
  if (typeof e != "bigint")
    throw new TypeError(U0(e));
  return e;
}
function Gf(e, t = "number") {
  if (typeof e == "bigint")
    throw new TypeError(H0(t));
  if (e = Number(e), !Number.isFinite(e))
    throw new RangeError(q0(t, e));
  return e;
}
function Oe(e, t) {
  return Math.trunc(Gf(e, t)) || 0;
}
function ns(e, t) {
  return $f(Gf(e, t), t);
}
function Kc(e, t) {
  return Kf(Oe(e, t), t);
}
function rs(e, t) {
  let [n, r] = Lt(t, se), o = e + n;
  const i = Math.sign(o);
  return i && i === -Math.sign(r) && (o -= i, r += i * se), [o, r];
}
function Rn(e, t, n = 1) {
  return rs(e[0] + t[0] * n, e[1] + t[1] * n);
}
function an(e, t) {
  return rs(e[0], e[1] + t);
}
function st(e, t) {
  return Rn(t, e, -1);
}
function qe(e, t) {
  return Bt(e[0], t[0]) || Bt(e[1], t[1]);
}
function Vf(e, t, n) {
  return qe(e, t) === -1 || qe(e, n) === 1;
}
function os(e, t = 1) {
  const n = BigInt(se / t);
  return [Number(e / n), Number(e % n) * t];
}
function co(e, t = 1) {
  const n = se / t, [r, o] = Lt(e, n);
  return [r, o * t];
}
function ct(e, t = 1, n) {
  const [r, o] = e, [i, a] = Lt(o, t);
  return r * (se / t) + (i + (n ? a / t : 0));
}
function is(e, t, n = yt) {
  const [r, o] = e, [i, a] = n(o, t);
  return [r * (se / t) + i, a];
}
function as(e) {
  return Ce(e, "isoYear", gr, mr, 1), e.isoYear === gr ? Ce(e, "isoMonth", 4, 12, 1) : e.isoYear === mr && Ce(e, "isoMonth", 1, 9, 1), e;
}
function Ve(e) {
  return ze({
    ...e,
    ...Be,
    isoHour: 12
  }), e;
}
function ze(e) {
  const t = Ce(e, "isoYear", gr, mr, 1), n = t === gr ? 1 : t === mr ? -1 : 0;
  return n && ft(be({
    ...e,
    isoDay: e.isoDay + n,
    isoNanosecond: e.isoNanosecond - n
  })), e;
}
function ft(e) {
  if (!e || Vf(e, Og, Ig))
    throw new RangeError(Xt);
  return e;
}
function qt(e) {
  return qf(e, 5, Qe)[1];
}
function jo(e) {
  const [t, n] = yt(e, se);
  return [Oo(n, 5, Qe), t];
}
function Gc(e) {
  return is(e, it);
}
function je(e) {
  return Bn(e.isoYear, e.isoMonth, e.isoDay, e.isoHour, e.isoMinute, e.isoSecond, e.isoMillisecond);
}
function be(e) {
  const t = je(e);
  if (t !== void 0) {
    const [n, r] = Lt(t, Ne);
    return [n, r * Ot + (e.isoMicrosecond || 0) * Or + (e.isoNanosecond || 0)];
  }
}
function ss(e, t) {
  const [n, r] = jo(qt(e) - t);
  return ft(be({
    ...e,
    isoDay: e.isoDay + r,
    ...n
  }));
}
function lo(...e) {
  return Bn(...e) / ap;
}
function Bn(...e) {
  const [t, n] = Yf(...e), r = t.valueOf();
  if (!isNaN(r))
    return r - n * Ne;
}
function Yf(e, t = 1, n = 1, r = 0, o = 0, i = 0, a = 0) {
  const s = e === gr ? 1 : e === mr ? -1 : 0, c = /* @__PURE__ */ new Date();
  return c.setUTCHours(r, o, i, a), c.setUTCFullYear(e, t - 1, n + s), [c, s];
}
function Fn(e, t) {
  let [n, r] = an(e, t);
  r < 0 && (r += se, n -= 1);
  const [o, i] = yt(r, Ot), [a, s] = yt(i, Or);
  return Po(n * Ne + o, a, s);
}
function Po(e, t = 0, n = 0) {
  const r = Math.ceil(Math.max(0, Math.abs(e) - tc) / Ne) * Math.sign(e), o = new Date(e - r * Ne);
  return zn(Zo, [o.getUTCFullYear(), o.getUTCMonth() + 1, o.getUTCDate() + r, o.getUTCHours(), o.getUTCMinutes(), o.getUTCSeconds(), o.getUTCMilliseconds(), t, n]);
}
function cs(e, t) {
  if (t < -tc)
    throw new RangeError(Xt);
  const n = e.formatToParts(t), r = {};
  for (const o of n)
    r[o.type] = o.value;
  return r;
}
function ls(e) {
  return [e.isoYear, e.isoMonth, e.isoDay];
}
function Wf(e, t) {
  return [t, 0];
}
function Zf() {
  return Ct;
}
function Jf(e, t) {
  switch (t) {
    case 2:
      return us(e) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
  }
  return 31;
}
function Xf(e) {
  return us(e) ? 366 : 365;
}
function us(e) {
  return e % 4 == 0 && (e % 100 != 0 || e % 400 == 0);
}
function Qf(e) {
  const [t, n] = Yf(e.isoYear, e.isoMonth, e.isoDay);
  return ar(t.getUTCDay() - n, 7) || 7;
}
function ed(e) {
  return this.id === Gn ? (({ isoYear: t }) => t < 1 ? ["gregory-inverse", 1 - t] : ["gregory", t])(e) : this.id === $t ? kg(e) : [];
}
function fm(e) {
  const t = je(e);
  if (t < Pg) {
    const { isoYear: i } = e;
    return i < 1 ? ["japanese-inverse", 1 - i] : ["japanese", i];
  }
  const n = cs(fc($t), t), { era: r, eraYear: o } = Ld(n, $t);
  return [r, o];
}
function ko(e) {
  return un(e), Dn(e, 1), e;
}
function un(e) {
  return td(e, 1), e;
}
function Vc(e) {
  return Df(Xs, e, td(e));
}
function td(e, t) {
  const { isoYear: n } = e, r = Ce(e, "isoMonth", 1, Zf(), t);
  return {
    isoYear: n,
    isoMonth: r,
    isoDay: Ce(e, "isoDay", 1, Jf(n, r), t)
  };
}
function Dn(e, t) {
  return zn(Qe, [Ce(e, "isoHour", 0, 23, t), Ce(e, "isoMinute", 0, 59, t), Ce(e, "isoSecond", 0, 59, t), Ce(e, "isoMillisecond", 0, 999, t), Ce(e, "isoMicrosecond", 0, 999, t), Ce(e, "isoNanosecond", 0, 999, t)]);
}
function ee(e) {
  return e === void 0 ? 0 : wp(_r(e));
}
function Ro(e, t = 0) {
  e = dt(e);
  const n = Ep(e), r = Lg(e, t);
  return [wp(e), r, n];
}
function Ln(e, t, n, r = 9, o = 0, i = 4) {
  t = dt(t);
  let a = _p(t, r, o), s = ps(t), c = kr(t, i);
  const l = Pr(t, r, o, 1);
  return a == null ? a = Math.max(n, l) : id(a, l), s = hs(s, l, 1), e && (c = ((f) => f < 4 ? (f + 2) % 4 : f)(c)), [a, l, s, c];
}
function Mo(e, t = 6, n) {
  let r = ps(e = Co(e, go));
  const o = kr(e, 7);
  let i = Pr(e, t);
  return i = Uf(go, i), r = hs(r, i, void 0, n), [i, r, o];
}
function fs(e) {
  return nc(dt(e));
}
function nd(e, t) {
  return ds(dt(e), t);
}
function dm(e) {
  const t = Co(e, mi), n = Gt(mi, Fg, t, 0);
  if (!n)
    throw new RangeError(Jt(mi, n));
  return n;
}
function ds(e, t = 4) {
  const n = od(e);
  return [kr(e, 4), ...rd(Pr(e, t), n)];
}
function rd(e, t) {
  return e != null ? [lt[e], e < 4 ? 9 - 3 * e : -1] : [t === void 0 ? 1 : 10 ** (9 - t), t];
}
function ps(e) {
  const t = e[sr];
  return t === void 0 ? 1 : Oe(t, sr);
}
function hs(e, t, n, r) {
  const o = r ? se : lt[t + 1];
  if (o) {
    const i = lt[t];
    if (o % ((e = wt(sr, e, 1, o / i - (r ? 0 : 1), 1)) * i))
      throw new RangeError(Jt(sr, e));
  } else
    e = wt(sr, e, 1, n ? 10 ** 9 : 1, 1);
  return e;
}
function od(e) {
  let t = e[hi];
  if (t !== void 0) {
    if (typeof t != "number") {
      if (es(t) === "auto")
        return;
      throw new RangeError(Jt(hi, t));
    }
    t = wt(hi, Math.floor(t), 0, 9, 1);
  }
  return t;
}
function dt(e) {
  return e === void 0 ? {} : _r(e);
}
function Co(e, t) {
  return typeof e == "string" ? {
    [t]: e
  } : _r(e);
}
function xo(e) {
  return {
    overflow: Rg[e]
  };
}
function ms(e, t, n = 9, r = 0, o) {
  let i = t[e];
  if (i === void 0)
    return o ? r : void 0;
  if (i = es(i), i === "auto")
    return o ? r : null;
  let a = Da[i];
  if (a === void 0 && (a = Sg[i]), a === void 0)
    throw new RangeError(Qd(e, i, Da));
  return wt(e, a, r, n, 1, $s), a;
}
function Gt(e, t, n, r = 0) {
  const o = n[e];
  if (o === void 0)
    return r;
  const i = es(o), a = t[i];
  if (a === void 0)
    throw new RangeError(Qd(e, i, t));
  return a;
}
function id(e, t) {
  if (t > e)
    throw new RangeError(dg);
}
function At(e) {
  return {
    branding: ac,
    epochNanoseconds: e
  };
}
function Je(e, t, n) {
  return {
    branding: Qt,
    calendar: n,
    timeZone: t,
    epochNanoseconds: e
  };
}
function Xe(e, t = e.calendar) {
  return {
    branding: Vn,
    calendar: t,
    ...Ze(Tg, e)
  };
}
function It(e, t = e.calendar) {
  return {
    branding: Rr,
    calendar: t,
    ...Ze(Qs, e)
  };
}
function fr(e, t = e.calendar) {
  return {
    branding: rc,
    calendar: t,
    ...Ze(Qs, e)
  };
}
function uo(e, t = e.calendar) {
  return {
    branding: oc,
    calendar: t,
    ...Ze(Qs, e)
  };
}
function pt(e) {
  return {
    branding: ic,
    ...Ze(gp, e)
  };
}
function ye(e) {
  return {
    branding: sc,
    sign: Vt(e),
    ...Ze(Ws, e)
  };
}
function gs(e) {
  return is(e.epochNanoseconds, Ot)[0];
}
function pm(e) {
  return ((t, n = 1) => {
    const [r, o] = t, i = Math.floor(o / n), a = se / n;
    return BigInt(r) * BigInt(a) + BigInt(i);
  })(e.epochNanoseconds);
}
function ad(e) {
  return e.epochNanoseconds;
}
function hm(e, t, n, r, o) {
  const i = sn(r), [a, s] = ((m, y) => {
    const S = y((m = Co(m, Ha))[vp]);
    let v = Dg(m);
    return v = Uf(Ha, v), [v, S];
  })(o, e), c = Math.max(a, i);
  if (!s && pr(c, s))
    return Yc(r, a);
  if (!s)
    throw new RangeError(Vo);
  if (!r.sign)
    return 0;
  const [l, f, u] = Do(t, n, s), d = As(u), b = Lo(u), h = Is(u), g = b(f, l, r);
  Mn(s) || (ze(l), ze(g));
  const T = h(f, l, g, a);
  return pr(a, s) ? Yc(T, a) : ((m, y, S, v, _, E, I) => {
    const k = Vt(m), [M, x] = ys(v, Js(S, m), S, k, _, E, I), q = vs(y, M, x);
    return m[oe[S]] + q * k;
  })(T, d(g), a, f, l, d, b);
}
function Yc(e, t) {
  return ct(we(e), lt[t], 1);
}
function ys(e, t, n, r, o, i, a) {
  const s = oe[n], c = {
    ...t,
    [s]: t[s] + r
  }, l = a(e, o, t), f = a(e, o, c);
  return [i(l), i(f)];
}
function vs(e, t, n) {
  const r = ct(st(t, n));
  if (!r)
    throw new RangeError(Kn);
  return ct(st(t, e)) / r;
}
function mm(e, t) {
  const [n, r, o] = Mo(t, 5, 1);
  return At(zo(e.epochNanoseconds, n, r, o, 1));
}
function gm(e, t, n) {
  let { epochNanoseconds: r, timeZone: o, calendar: i } = t;
  const [a, s, c] = Mo(n);
  if (a === 0 && s === 1)
    return t;
  const l = e(o);
  if (a === 6)
    r = ((f, u, d, b) => {
      const h = Ue(d, u), [g, T] = f(h), m = d.epochNanoseconds, y = Ut(u, g), S = Ut(u, T);
      if (Vf(m, y, S))
        throw new RangeError(Kn);
      return fd(vs(m, y, S), b) ? S : y;
    })(ld, l, t, c);
  else {
    const f = l.R(r);
    r = qn(l, sd(Fn(r, f), a, s, c), f, 2, 0, 1);
  }
  return Je(r, o, i);
}
function ym(e, t) {
  return Xe(sd(e, ...Mo(t)), e.calendar);
}
function vm(e, t) {
  const [n, r, o] = Mo(t, 5);
  var i;
  return pt((i = o, bs(e, wr(n, r), i)[0]));
}
function bm(e, t) {
  const n = e(t.timeZone), r = Ue(t, n), [o, i] = ld(r), a = ct(st(Ut(n, o), Ut(n, i)), Wo, 1);
  if (a <= 0)
    throw new RangeError(Kn);
  return a;
}
function _m(e, t) {
  const { timeZone: n, calendar: r } = t, o = ((i, a, s) => Ut(a, i(Ue(s, a))))(ud, e(n), t);
  return Je(o, n, r);
}
function sd(e, t, n, r) {
  return cd(e, wr(t, n), r);
}
function cd(e, t, n) {
  const [r, o] = bs(e, t, n);
  return ze({
    ...fn(e, o),
    ...r
  });
}
function bs(e, t, n) {
  return jo(Ht(qt(e), t, n));
}
function fo(e) {
  return Ht(e, Yo, 7);
}
function wr(e, t) {
  return lt[e] * t;
}
function ld(e) {
  const t = ud(e);
  return [t, fn(t, 1)];
}
function ud(e) {
  return Ag(6, e);
}
function wm(e, t, n) {
  const r = Math.min(sn(e), 6);
  return Hn(Bo(we(e, r), t, n), r);
}
function No(e, t, n, r, o, i, a, s, c, l) {
  if (r === 0 && o === 1)
    return e;
  const f = pr(r, s) ? Mn(s) && r < 6 && n >= 6 ? Sm : Em : Tm;
  let [u, d, b] = f(e, t, n, r, o, i, a, s, c, l);
  return b && r !== 7 && (u = ((h, g, T, m, y, S, v, _) => {
    const E = Vt(h);
    for (let I = m + 1; I <= T; I++) {
      if (I === 7 && T !== 7)
        continue;
      const k = Js(I, h);
      k[oe[I]] += E;
      const M = ct(st(v(_(y, S, k)), g));
      if (M && Math.sign(M) !== E)
        break;
      h = k;
    }
    return h;
  })(u, d, n, Math.max(6, r), a, s, c, l)), u;
}
function zo(e, t, n, r, o) {
  if (t === 6) {
    const i = ((a) => a[0] + a[1] / se)(e);
    return [Ht(i, n, r), 0];
  }
  return Bo(e, wr(t, n), r, o);
}
function Bo(e, t, n, r) {
  let [o, i] = e;
  r && i < 0 && (i += se, o -= 1);
  const [a, s] = yt(Ht(i, t, n), se);
  return rs(o + a, s);
}
function Ht(e, t, n) {
  return fd(e / t, n) * t;
}
function fd(e, t) {
  return Ug[t](e);
}
function Em(e, t, n, r, o, i) {
  const a = Vt(e), s = we(e), c = zo(s, r, o, i), l = st(s, c), f = Math.sign(c[0] - s[0]) === a, u = Hn(c, Math.min(n, 6));
  return [{
    ...e,
    ...u
  }, Rn(t, l), f];
}
function Sm(e, t, n, r, o, i, a, s, c, l) {
  const f = Vt(e) || 1, u = ct(we(e, 5)), d = wr(r, o);
  let b = Ht(u, d, i);
  const [h, g] = ys(a, {
    ...e,
    ...Zs
  }, 6, f, s, c, l), T = b - ct(st(h, g));
  let m = 0;
  T && Math.sign(T) !== f ? t = an(h, b) : (m += f, b = Ht(T, d, i), t = an(g, b));
  const y = qo(b);
  return [{
    ...e,
    ...y,
    days: e.days + m
  }, t, !!m];
}
function Tm(e, t, n, r, o, i, a, s, c, l) {
  const f = Vt(e), u = oe[r], d = Js(r, e);
  r === 7 && (e = {
    ...e,
    weeks: e.weeks + Math.trunc(e.days / 7)
  });
  const b = Io(e[u], o) * o;
  d[u] = b;
  const [h, g] = ys(a, d, r, o * f, s, c, l), T = b + vs(t, h, g) * f * o, m = Ht(T, o, i), y = Math.sign(m - T) === f;
  return d[u] = m, [d, y ? g : h, y];
}
function Wc(e, t, n, r) {
  const [o, i, a, s] = ((l) => {
    const f = ds(l = dt(l));
    return [l.timeZone, ...f];
  })(r), c = o !== void 0;
  return ((l, f, u, d, b, h) => {
    u = Bo(u, b, d, 1);
    const g = f.R(u);
    return _s(Fn(u, g), h) + (l ? Er(fo(g)) : "Z");
  })(c, t(c ? e(o) : mn), n.epochNanoseconds, i, a, s);
}
function Zc(e, t, n) {
  const [r, o, i, a, s, c] = ((l) => {
    l = dt(l);
    const f = nc(l), u = od(l), d = Hg(l), b = kr(l, 4), h = Pr(l, 4);
    return [f, qg(l), d, b, ...rd(h, u)];
  })(n);
  return ((l, f, u, d, b, h, g, T, m, y) => {
    d = Bo(d, m, T, 1);
    const S = l(u).R(d);
    return _s(Fn(d, S), y) + Er(fo(S), g) + ((v, _) => _ !== 1 ? "[" + (_ === 2 ? "!" : "") + v + "]" : "")(u, h) + ws(f, b);
  })(e, t.calendar, t.timeZone, t.epochNanoseconds, r, o, i, a, s, c);
}
function Jc(e, t) {
  const [n, r, o, i] = ((l) => (l = dt(l), [nc(l), ...ds(l)]))(t);
  return a = e.calendar, s = n, c = i, _s(cd(e, o, r), c) + ws(a, s);
  var a, s, c;
}
function Xc(e, t) {
  return n = e.calendar, r = e, o = fs(t), po(r) + ws(n, o);
  var n, r, o;
}
function Qc(e, t) {
  return dd(e.calendar, pd, e, fs(t));
}
function el(e, t) {
  return dd(e.calendar, Am, e, fs(t));
}
function tl(e, t) {
  const [n, r, o] = nd(t);
  return i = o, hd(bs(e, r, n)[0], i);
  var i;
}
function ci(e, t) {
  const [n, r, o] = nd(t, 3);
  return r > 1 && dn(e = {
    ...e,
    ...wm(e, r, n)
  }), ((i, a) => {
    const { sign: s } = i, c = s === -1 ? Re(i) : i, { hours: l, minutes: f } = c, [u, d] = is(we(c, 3), it, Lt);
    vd(u);
    const b = Es(d, a), h = a >= 0 || !s || b;
    return (s < 0 ? "-" : "") + "P" + nl({
      Y: rn(c.years),
      M: rn(c.months),
      W: rn(c.weeks),
      D: rn(c.days)
    }) + (l || f || u || h ? "T" + nl({
      H: rn(l),
      M: rn(f),
      S: rn(u, h) + b
    }) : "");
  })(e, o);
}
function dd(e, t, n, r) {
  const o = r > 1 || r === 0 && e !== X;
  return r === 1 ? e === X ? t(n) : po(n) : o ? po(n) + md(e, r === 2) : t(n);
}
function nl(e) {
  const t = [];
  for (const n in e) {
    const r = e[n];
    r && t.push(r, n);
  }
  return t.join("");
}
function _s(e, t) {
  return po(e) + "T" + hd(e, t);
}
function po(e) {
  return pd(e) + "-" + Ye(e.isoDay);
}
function pd(e) {
  const { isoYear: t } = e;
  return (t < 0 || t > 9999 ? gd(t) + so(6, Math.abs(t)) : so(4, t)) + "-" + Ye(e.isoMonth);
}
function Am(e) {
  return Ye(e.isoMonth) + "-" + Ye(e.isoDay);
}
function hd(e, t) {
  const n = [Ye(e.isoHour), Ye(e.isoMinute)];
  return t !== -1 && n.push(Ye(e.isoSecond) + ((r, o, i, a) => Es(r * Ot + o * Or + i, a))(e.isoMillisecond, e.isoMicrosecond, e.isoNanosecond, t)), n.join(":");
}
function Er(e, t = 0) {
  if (t === 1)
    return "";
  const [n, r] = yt(Math.abs(e), Wo), [o, i] = yt(r, Yo), [a, s] = yt(i, it);
  return gd(e) + Ye(n) + ":" + Ye(o) + (a || s ? ":" + Ye(a) + Es(s) : "");
}
function ws(e, t) {
  return t !== 1 && (t > 1 || t === 0 && e !== X) ? md(e, t === 2) : "";
}
function md(e, t) {
  return "[" + (t ? "!" : "") + "u-ca=" + e + "]";
}
function Es(e, t) {
  let n = so(9, e);
  return n = t === void 0 ? n.replace(Gg, "") : n.slice(0, t), n ? "." + n : "";
}
function gd(e) {
  return e < 0 ? "-" : "+";
}
function rn(e, t) {
  return e || t ? e.toLocaleString("fullwide", {
    useGrouping: 0
  }) : "";
}
function Im(e, t) {
  const { epochNanoseconds: n } = e, r = (t.R ? t : t(e.timeZone)).R(n), o = Fn(n, r);
  return {
    calendar: e.calendar,
    ...o,
    offsetNanoseconds: r
  };
}
function qn(e, t, n, r = 0, o = 0, i, a) {
  if (n !== void 0 && r === 1 && (r === 1 || a))
    return ss(t, n);
  const s = e.I(t);
  if (n !== void 0 && r !== 3) {
    const c = ((l, f, u, d) => {
      const b = be(f);
      d && (u = fo(u));
      for (const h of l) {
        let g = ct(st(h, b));
        if (d && (g = fo(g)), g === u)
          return h;
      }
    })(s, t, n, i);
    if (c !== void 0)
      return c;
    if (r === 0)
      throw new RangeError(ag);
  }
  return a ? be(t) : Sr(e, t, o, s);
}
function Sr(e, t, n = 0, r = e.I(t)) {
  if (r.length === 1)
    return r[0];
  if (n === 1)
    throw new RangeError(sg);
  if (r.length)
    return r[n === 3 ? 1 : 0];
  const o = be(t), i = ((s, c) => {
    const l = s.R(an(c, -se));
    return ((f) => {
      if (f > se)
        throw new RangeError(ig);
      return f;
    })(s.R(an(c, se)) - l);
  })(e, o), a = i * (n === 2 ? -1 : 1);
  return (r = e.I(Fn(o, a)))[n === 2 ? 0 : r.length - 1];
}
function Ut(e, t) {
  const n = e.I(t);
  if (n.length)
    return n[0];
  const r = an(be(t), -se);
  return e.O(r, 1);
}
function rl(e, t, n) {
  return At(ft(Rn(t.epochNanoseconds, ((r) => {
    if (bd(r))
      throw new RangeError(ug);
    return we(r, 5);
  })(e ? Re(n) : n))));
}
function ol(e, t, n, r, o, i = /* @__PURE__ */ Object.create(null)) {
  const a = t(r.timeZone), s = e(r.calendar);
  return {
    ...r,
    ...Ss(a, s, r, n ? Re(o) : o, i)
  };
}
function il(e, t, n, r, o = /* @__PURE__ */ Object.create(null)) {
  const { calendar: i } = n;
  return Xe(Ts(e(i), n, t ? Re(r) : r, o), i);
}
function al(e, t, n, r, o) {
  const { calendar: i } = n;
  return It(Fo(e(i), n, t ? Re(r) : r, o), i);
}
function sl(e, t, n, r, o) {
  const i = n.calendar, a = e(i);
  let s = Ve(dr(a, n));
  t && (r = Os(r)), r.sign < 0 && (s = a.P(s, {
    ...Ee,
    months: 1
  }), s = fn(s, -1));
  const c = a.P(s, r, o);
  return fr(dr(a, c), i);
}
function cl(e, t, n) {
  return pt(yd(t, e ? Re(n) : n)[0]);
}
function Ss(e, t, n, r, o) {
  const i = we(r, 5);
  let a = n.epochNanoseconds;
  if (bd(r)) {
    const s = Ue(n, e);
    a = Rn(Sr(e, {
      ...Fo(t, s, {
        ...r,
        ...Zs
      }, o),
      ...Ze(Qe, s)
    }), i);
  } else
    a = Rn(a, i), ee(o);
  return {
    epochNanoseconds: ft(a)
  };
}
function Ts(e, t, n, r) {
  const [o, i] = yd(t, n);
  return ze({
    ...Fo(e, t, {
      ...n,
      ...Zs,
      days: n.days + i
    }, r),
    ...o
  });
}
function Fo(e, t, n, r) {
  if (n.years || n.months || n.weeks)
    return e.P(t, n, r);
  ee(r);
  const o = n.days + we(n, 5)[0];
  return o ? Ve(fn(t, o)) : t;
}
function dr(e, t, n = 1) {
  return fn(t, n - e.day(t));
}
function yd(e, t) {
  const [n, r] = we(t, 5), [o, i] = jo(qt(e) + r);
  return [o, n + i];
}
function fn(e, t) {
  return t ? {
    ...e,
    ...Po(je(e) + t * Ne)
  } : e;
}
function Do(e, t, n) {
  const r = e(n.calendar);
  return Mn(n) ? [n, r, t(n.timeZone)] : [{
    ...n,
    ...Be
  }, r];
}
function As(e) {
  return e ? ad : be;
}
function Lo(e) {
  return e ? J(Ss, e) : Ts;
}
function Is(e) {
  return e ? J(Zm, e) : Jm;
}
function Mn(e) {
  return e && e.epochNanoseconds;
}
function pr(e, t) {
  return e <= 6 - (Mn(t) ? 1 : 0);
}
function ll(e, t, n, r, o, i, a) {
  const s = e(dt(a).relativeTo), c = Math.max(sn(o), sn(i));
  if (pr(c, s))
    return ye(dn(((g, T, m, y) => {
      const S = Rn(we(g), we(T), y ? -1 : 1);
      if (!Number.isFinite(S[0]))
        throw new RangeError(Xt);
      return {
        ...Ee,
        ...Hn(S, m)
      };
    })(o, i, c, r)));
  if (!s)
    throw new RangeError(Vo);
  r && (i = Re(i));
  const [l, f, u] = Do(t, n, s), d = Lo(u), b = Is(u), h = d(f, l, o);
  return ye(b(f, l, d(f, h, i), c));
}
function Om(e, t, n, r, o) {
  const i = sn(r), [a, s, c, l, f] = ((E, I, k) => {
    E = Co(E, go);
    let M = _p(E);
    const x = k(E[vp]);
    let q = ps(E);
    const V = kr(E, 7);
    let ie = Pr(E);
    if (M === void 0 && ie === void 0)
      throw new RangeError(fg);
    if (ie == null && (ie = 0), M == null && (M = Math.max(ie, I)), id(M, ie), q = hs(q, ie, 1), q > 1 && ie > 5 && M !== ie)
      throw new RangeError("For calendar units with roundingIncrement > 1, use largestUnit = smallestUnit");
    return [M, ie, q, V, x];
  })(o, i, e), u = Math.max(i, a);
  if (!f && u <= 6)
    return ye(dn(((E, I, k, M, x) => {
      const q = zo(we(E), k, M, x);
      return {
        ...Ee,
        ...Hn(q, I)
      };
    })(r, a, s, c, l)));
  if (!Mn(f) && !r.sign)
    return r;
  if (!f)
    throw new RangeError(Vo);
  const [d, b, h] = Do(t, n, f), g = As(h), T = Lo(h), m = Is(h), y = T(b, d, r);
  Mn(f) || (ze(d), ze(y));
  let S = m(b, d, y, a);
  const v = r.sign, _ = Vt(S);
  if (v && _ && v !== _)
    throw new RangeError(Kn);
  return S = No(S, g(y), a, s, c, l, b, d, g, T), ye(S);
}
function jm(e) {
  return e.sign === -1 ? Os(e) : e;
}
function Os(e) {
  return ye(Re(e));
}
function Re(e) {
  const t = {};
  for (const n of oe)
    t[n] = -1 * e[n] || 0;
  return t;
}
function Pm(e) {
  return !e.sign;
}
function Vt(e, t = oe) {
  let n = 0;
  for (const r of t) {
    const o = Math.sign(e[r]);
    if (o) {
      if (n && n !== o)
        throw new RangeError(lg);
      n = o;
    }
  }
  return n;
}
function dn(e) {
  for (const t of Eg)
    wt(t, e[t], -_l, _l, 1);
  return vd(ct(we(e), it)), e;
}
function vd(e) {
  if (!Number.isSafeInteger(e))
    throw new RangeError(cg);
}
function we(e, t = 6) {
  return qf(e, t, oe);
}
function Hn(e, t = 6) {
  const [n, r] = e, o = Oo(r, t, oe);
  if (o[oe[t]] += n * (se / lt[t]), !Number.isFinite(o[oe[t]]))
    throw new RangeError(Xt);
  return o;
}
function qo(e, t = 5) {
  return Oo(e, t, oe);
}
function bd(e) {
  return !!Vt(e, mp);
}
function sn(e) {
  let t = 9;
  for (; t > 0 && !e[oe[t]]; t--)
    ;
  return t;
}
function km(e, t) {
  return [e, t];
}
function ul(e) {
  const t = Math.floor(e / ro) * ro;
  return [t, t + ro];
}
function Rm(e) {
  const t = Yt(e = to(e));
  if (!t)
    throw new RangeError(xe(e));
  let n;
  if (t.j)
    n = 0;
  else {
    if (!t.offset)
      throw new RangeError(xe(e));
    n = pn(t.offset);
  }
  return t.timeZone && Ms(t.timeZone, 1), At(ss(ko(t), n));
}
function Mm(e) {
  const t = Yt(Te(e));
  if (!t)
    throw new RangeError(xe(e));
  if (t.timeZone)
    return _d(t, t.offset ? pn(t.offset) : void 0);
  if (t.j)
    throw new RangeError(xe(e));
  return Ed(t);
}
function Cm(e, t) {
  const n = Yt(Te(e));
  if (!n || !n.timeZone)
    throw new RangeError(xe(e));
  const { offset: r } = n, o = r ? pn(r) : void 0, [, i, a] = Ro(t);
  return _d(n, o, i, a);
}
function pn(e) {
  const t = Ms(e);
  if (t === void 0)
    throw new RangeError(xe(e));
  return t;
}
function xm(e) {
  const t = Yt(Te(e));
  if (!t || t.j)
    throw new RangeError(xe(e));
  return Xe(wd(t));
}
function js(e, t, n) {
  let r = Yt(Te(e));
  if (!r || r.j)
    throw new RangeError(xe(e));
  return t ? r.calendar === X && (r = r.isoYear === -271821 && r.isoMonth === 4 ? {
    ...r,
    isoDay: 20,
    ...Be
  } : {
    ...r,
    isoDay: 1,
    ...Be
  }) : n && r.calendar === X && (r = {
    ...r,
    isoYear: bt
  }), It(r.C ? wd(r) : Ed(r));
}
function Nm(e, t) {
  const n = ks(Te(t));
  if (n)
    return Ps(n), fr(as(un(n)));
  const r = js(t, 1);
  return fr(dr(e(r.calendar), r));
}
function Ps(e) {
  if (e.calendar !== X)
    throw new RangeError(vt(e.calendar));
}
function zm(e, t) {
  const n = Rs(Te(t));
  if (n)
    return Ps(n), uo(un(n));
  const r = js(t, 0, 1), { calendar: o } = r, i = e(o), [a, s, c] = i.v(r), [l, f] = i.q(a, s), [u, d] = i.G(l, f, c);
  return uo(Ve(i.V(u, d, c)), o);
}
function Bm(e) {
  let t, n = ((r) => {
    const o = Qg.exec(r);
    return o ? (Ho(o[10]), Ad(o)) : void 0;
  })(Te(e));
  if (!n) {
    if (n = Yt(e), !n)
      throw new RangeError(xe(e));
    if (!n.C)
      throw new RangeError(xe(e));
    if (n.j)
      throw new RangeError(vt("Z"));
    Ps(n);
  }
  if ((t = ks(e)) && Vc(t))
    throw new RangeError(xe(e));
  if ((t = Rs(e)) && Vc(t))
    throw new RangeError(xe(e));
  return pt(Dn(n, 1));
}
function Fm(e) {
  const t = ((n) => {
    const r = ny.exec(n);
    return r ? ((o) => {
      function i(f, u, d) {
        let b = 0, h = 0;
        if (d && ([b, c] = yt(c, lt[d])), f !== void 0) {
          if (s)
            throw new RangeError(vt(f));
          h = ((g) => {
            const T = parseInt(g);
            if (!Number.isFinite(T))
              throw new RangeError(vt(g));
            return T;
          })(f), a = 1, u && (c = Cs(u) * (lt[d] / it), s = 1);
        }
        return b + h;
      }
      let a = 0, s = 0, c = 0, l = {
        ...zn(oe, [i(o[2]), i(o[3]), i(o[4]), i(o[5]), i(o[6], o[7], 5), i(o[8], o[9], 4), i(o[10], o[11], 3)]),
        ...Oo(c, 2, oe)
      };
      if (!a)
        throw new RangeError(Xd(oe));
      return xs(o[1]) < 0 && (l = Re(l)), l;
    })(r) : void 0;
  })(Te(e));
  if (!t)
    throw new RangeError(xe(e));
  return ye(dn(t));
}
function Dm(e) {
  const t = Yt(e) || ks(e) || Rs(e);
  return t ? t.calendar : e;
}
function Lm(e) {
  const t = Yt(e);
  return t && (t.timeZone || t.j && mn || t.offset) || e;
}
function _d(e, t, n = 0, r = 0) {
  const o = Ns(e.timeZone), i = G(o);
  let a;
  return ko(e), a = e.C ? qn(i, e, t, n, r, !i.$, e.j) : Ut(i, e), Je(a, o, Go(e.calendar));
}
function wd(e) {
  return Sd(ze(ko(e)));
}
function Ed(e) {
  return Sd(Ve(un(e)));
}
function Sd(e) {
  return {
    ...e,
    calendar: Go(e.calendar)
  };
}
function Yt(e) {
  const t = Xg.exec(e);
  return t ? ((n) => {
    const r = n[10], o = (r || "").toUpperCase() === "Z";
    return {
      isoYear: Td(n),
      isoMonth: parseInt(n[4]),
      isoDay: parseInt(n[5]),
      ...Ad(n.slice(5)),
      ...Ho(n[16]),
      C: !!n[6],
      j: o,
      offset: o ? void 0 : r
    };
  })(t) : void 0;
}
function ks(e) {
  const t = Zg.exec(e);
  return t ? ((n) => ({
    isoYear: Td(n),
    isoMonth: parseInt(n[4]),
    isoDay: 1,
    ...Ho(n[5])
  }))(t) : void 0;
}
function Rs(e) {
  const t = Jg.exec(e);
  return t ? ((n) => ({
    isoYear: bt,
    isoMonth: parseInt(n[1]),
    isoDay: parseInt(n[2]),
    ...Ho(n[3])
  }))(t) : void 0;
}
function Ms(e, t) {
  const n = ey.exec(e);
  return n ? ((r, o) => {
    const i = r[4] || r[5];
    if (o && i)
      throw new RangeError(vt(i));
    return ((a) => {
      if (Math.abs(a) >= se)
        throw new RangeError(og);
      return a;
    })((Pn(r[2]) * Wo + Pn(r[3]) * Yo + Pn(r[4]) * it + Cs(r[5] || "")) * xs(r[1]));
  })(n, t) : void 0;
}
function Td(e) {
  const t = xs(e[1]), n = parseInt(e[2] || e[3]);
  if (t < 0 && !n)
    throw new RangeError(vt(-0));
  return t * n;
}
function Ad(e) {
  const t = Pn(e[3]);
  return {
    ...jo(Cs(e[4] || ""))[0],
    isoHour: Pn(e[1]),
    isoMinute: Pn(e[2]),
    isoSecond: t === 60 ? 59 : t
  };
}
function Ho(e) {
  let t, n;
  const r = [];
  if (e.replace(ty, ((o, i, a) => {
    const s = !!i, [c, l] = a.split("=").reverse();
    if (l) {
      if (l === "u-ca")
        r.push(c), t || (t = s);
      else if (s || /[A-Z]/.test(l))
        throw new RangeError(vt(o));
    } else {
      if (n)
        throw new RangeError(vt(o));
      n = c;
    }
    return "";
  })), r.length > 1 && t)
    throw new RangeError(vt(e));
  return {
    timeZone: n,
    calendar: r[0] || X
  };
}
function Cs(e) {
  return parseInt(e.padEnd(9, "0"));
}
function Un(e) {
  return new RegExp(`^${e}$`, "i");
}
function xs(e) {
  return e && e !== "+" ? -1 : 1;
}
function Pn(e) {
  return e === void 0 ? 0 : parseInt(e);
}
function qm(e) {
  return Ns(Te(e));
}
function Ns(e) {
  const t = zs(e);
  return typeof t == "number" ? Er(t) : t ? ((n) => {
    if (iy.test(n))
      throw new RangeError(rp(n));
    if (oy.test(n))
      throw new RangeError(rg);
    return n.toLowerCase().split("/").map(((r, o) => (r.length <= 3 || /\d/.test(r)) && !/etc|yap/.test(r) ? r.toUpperCase() : r.replace(/baja|dumont|[a-z]+/g, ((i, a) => i.length <= 2 && !o || i === "in" || i === "chat" ? i.toUpperCase() : i.length > 2 || !a ? $c(i).replace(/island|noronha|murdo|rivadavia|urville/, $c) : i)))).join("/");
  })(e) : mn;
}
function fl(e) {
  const t = zs(e);
  return typeof t == "number" ? t : t ? t.resolvedOptions().timeZone : mn;
}
function zs(e) {
  const t = Ms(e = e.toUpperCase(), 1);
  return t !== void 0 ? t : e !== mn ? ry(e) : void 0;
}
function Id(e, t) {
  return qe(e.epochNanoseconds, t.epochNanoseconds);
}
function Od(e, t) {
  return qe(e.epochNanoseconds, t.epochNanoseconds);
}
function Hm(e, t, n, r, o, i) {
  const a = e(dt(i).relativeTo), s = Math.max(sn(r), sn(o));
  if (Df(oe, r, o))
    return 0;
  if (pr(s, a))
    return qe(we(r), we(o));
  if (!a)
    throw new RangeError(Vo);
  const [c, l, f] = Do(t, n, a), u = As(f), d = Lo(f);
  return qe(u(d(l, c, r)), u(d(l, c, o)));
}
function jd(e, t) {
  return $n(e, t) || Bs(e, t);
}
function $n(e, t) {
  return Bt(je(e), je(t));
}
function Bs(e, t) {
  return Bt(qt(e), qt(t));
}
function Um(e, t) {
  return !Id(e, t);
}
function $m(e, t) {
  return !Od(e, t) && !!Pd(e.timeZone, t.timeZone) && e.calendar === t.calendar;
}
function Km(e, t) {
  return !jd(e, t) && e.calendar === t.calendar;
}
function Gm(e, t) {
  return !$n(e, t) && e.calendar === t.calendar;
}
function Vm(e, t) {
  return !$n(e, t) && e.calendar === t.calendar;
}
function Ym(e, t) {
  return !$n(e, t) && e.calendar === t.calendar;
}
function Wm(e, t) {
  return !Bs(e, t);
}
function Pd(e, t) {
  if (e === t)
    return 1;
  try {
    return fl(e) === fl(t);
  } catch {
  }
}
function dl(e, t, n, r) {
  const o = Ln(e, r, 3, 5), i = Uo(t.epochNanoseconds, n.epochNanoseconds, ...o);
  return ye(e ? Re(i) : i);
}
function pl(e, t, n, r, o, i) {
  const a = Ko(r.calendar, o.calendar), [s, c, l, f] = Ln(n, i, 5), u = r.epochNanoseconds, d = o.epochNanoseconds, b = qe(d, u);
  let h;
  if (b)
    if (s < 6)
      h = Uo(u, d, s, c, l, f);
    else {
      const g = t(((m, y) => {
        if (!Pd(m, y))
          throw new RangeError(op);
        return m;
      })(r.timeZone, o.timeZone)), T = e(a);
      h = Rd(T, g, r, o, b, s, i), h = No(h, d, s, c, l, f, T, r, ad, J(Ss, g));
    }
  else
    h = Ee;
  return ye(n ? Re(h) : h);
}
function hl(e, t, n, r, o) {
  const i = Ko(n.calendar, r.calendar), [a, s, c, l] = Ln(t, o, 6), f = be(n), u = be(r), d = qe(u, f);
  let b;
  if (d)
    if (a <= 6)
      b = Uo(f, u, a, s, c, l);
    else {
      const h = e(i);
      b = Md(h, n, r, d, a, o), b = No(b, u, a, s, c, l, h, n, be, Ts);
    }
  else
    b = Ee;
  return ye(t ? Re(b) : b);
}
function ml(e, t, n, r, o) {
  const i = Ko(n.calendar, r.calendar);
  return kd(t, (() => e(i)), n, r, ...Ln(t, o, 6, 9, 6));
}
function gl(e, t, n, r, o) {
  const i = Ko(n.calendar, r.calendar), a = Ln(t, o, 9, 9, 8), s = e(i), c = dr(s, n), l = dr(s, r);
  return c.isoYear === l.isoYear && c.isoMonth === l.isoMonth && c.isoDay === l.isoDay ? ye(Ee) : kd(t, (() => s), Ve(c), Ve(l), ...a, 8);
}
function kd(e, t, n, r, o, i, a, s, c = 6) {
  const l = be(n), f = be(r);
  if (l === void 0 || f === void 0)
    throw new RangeError(Xt);
  let u;
  if (qe(f, l))
    if (o === 6)
      u = Uo(l, f, o, i, a, s);
    else {
      const d = t();
      u = d.N(n, r, o), i === c && a === 1 || (u = No(u, f, o, i, a, s, d, n, be, Fo));
    }
  else
    u = Ee;
  return ye(e ? Re(u) : u);
}
function yl(e, t, n, r) {
  const [o, i, a, s] = Ln(e, r, 5, 5), c = Ht(Fs(t, n), wr(i, a), s), l = {
    ...Ee,
    ...qo(c, o)
  };
  return ye(e ? Re(l) : l);
}
function Zm(e, t, n, r, o, i) {
  const a = qe(r.epochNanoseconds, n.epochNanoseconds);
  return a ? o < 6 ? Cd(n.epochNanoseconds, r.epochNanoseconds, o) : Rd(t, e, n, r, a, o, i) : Ee;
}
function Jm(e, t, n, r, o) {
  const i = be(t), a = be(n), s = qe(a, i);
  return s ? r <= 6 ? Cd(i, a, r) : Md(e, t, n, s, r, o) : Ee;
}
function Rd(e, t, n, r, o, i, a) {
  const [s, c, l] = ((d, b, h, g) => {
    function T() {
      return I = {
        ...fn(S, _++ * -g),
        ...y
      }, k = Sr(d, I), qe(v, k) === -g;
    }
    const m = Ue(b, d), y = Ze(Qe, m), S = Ue(h, d), v = h.epochNanoseconds;
    let _ = 0;
    const E = Fs(m, S);
    let I, k;
    if (Math.sign(E) === -g && _++, T() && (g === -1 || T()))
      throw new RangeError(Kn);
    const M = ct(st(k, v));
    return [m, I, M];
  })(t, n, r, o);
  var f, u;
  return {
    ...i === 6 ? (f = s, u = c, {
      ...Ee,
      days: xd(f, u)
    }) : e.N(s, c, i, a),
    ...qo(l)
  };
}
function Md(e, t, n, r, o, i) {
  const [a, s, c] = ((l, f, u) => {
    let d = f, b = Fs(l, f);
    return Math.sign(b) === -u && (d = fn(f, -u), b += se * u), [l, d, b];
  })(t, n, r);
  return {
    ...e.N(a, s, o, i),
    ...qo(c)
  };
}
function Uo(e, t, n, r, o, i) {
  return {
    ...Ee,
    ...Hn(zo(st(e, t), r, o, i), n)
  };
}
function Cd(e, t, n) {
  return {
    ...Ee,
    ...Hn(st(e, t), n)
  };
}
function xd(e, t) {
  return $o(je(e), je(t));
}
function $o(e, t) {
  return Math.trunc((t - e) / Ne);
}
function Fs(e, t) {
  return qt(t) - qt(e);
}
function Ko(e, t) {
  if (e !== t)
    throw new RangeError(np);
  return e;
}
function Nd(e) {
  return this.m(e)[0];
}
function zd(e) {
  return this.m(e)[1];
}
function Ds(e) {
  const [t] = this.v(e);
  return $o(this.p(t), je(e)) + 1;
}
function Ls(e) {
  const t = ay.exec(e);
  if (!t)
    throw new RangeError(tg(e));
  return [parseInt(t[1]), !!t[2]];
}
function Tr(e, t) {
  return "M" + Ye(e) + (t ? "L" : "");
}
function ho(e, t, n) {
  return e + (t || n && e >= n ? 1 : 0);
}
function qs(e, t) {
  return e - (t && e >= t ? 1 : 0);
}
function Bd(e, t) {
  return (t + e) * (Math.sign(t) || 1) || 0;
}
function za(e) {
  return pp[Dd(e)];
}
function Fd(e) {
  return vg[Dd(e)];
}
function Dd(e) {
  return cn(e.id || X);
}
function Xm(e) {
  function t(o) {
    return ((i, a) => ({
      ...Ld(i, a),
      o: i.month,
      day: parseInt(i.day)
    }))(cs(n, o), r);
  }
  const n = fc(e), r = cn(e);
  return {
    id: e,
    h: Qm(t),
    l: e0(t)
  };
}
function Qm(e) {
  return Le(((t) => {
    const n = je(t);
    return e(n);
  }), WeakMap);
}
function e0(e) {
  const t = e(0).year - jg;
  return Le(((n) => {
    let r, o = Bn(n - t), i = 0;
    const a = [], s = [];
    do
      o += 400 * Ne;
    while ((r = e(o)).year <= n);
    do
      if (o += (1 - r.day) * Ne, r.year === n && (a.push(o), s.push(r.o)), o -= Ne, ++i > 100 || o < -tc)
        throw new RangeError(Kn);
    while ((r = e(o)).year >= n);
    return {
      i: a.reverse(),
      u: ip(s.reverse())
    };
  }));
}
function Ld(e, t) {
  let n, r, o = qd(e);
  if (e.era) {
    const i = pp[t], a = hp[t] || {};
    i !== void 0 && (n = t === "islamic" ? "ah" : e.era.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, ""), n === "bc" || n === "b" ? n = "bce" : n === "ad" || n === "a" ? n = "ce" : n === "beforeroc" && (n = "broc"), n = a[n] || n, r = o, o = Bd(r, i[n] || 0));
  }
  return {
    era: n,
    eraYear: r,
    year: o
  };
}
function qd(e) {
  return parseInt(e.relatedYear || e.year);
}
function mo(e) {
  const { year: t, o: n, day: r } = this.h(e), { u: o } = this.l(t);
  return [t, o[n] + 1, r];
}
function hr(e, t = 1, n = 1) {
  return this.l(e).i[t - 1] + (n - 1) * Ne;
}
function Hd(e, t) {
  const n = no.call(this, e);
  return [qs(t, n), n === t];
}
function no(e) {
  const t = bl(this, e), n = bl(this, e - 1), r = t.length;
  if (r > n.length) {
    const o = Fd(this);
    if (o < 0)
      return -o;
    for (let i = 0; i < r; i++)
      if (t[i] !== n[i])
        return i + 1;
  }
}
function $r(e) {
  return $o(hr.call(this, e), hr.call(this, e + 1));
}
function vl(e, t) {
  const { i: n } = this.l(e);
  let r = t + 1, o = n;
  return r > n.length && (r = 1, o = this.l(e + 1).i), $o(n[t - 1], o[r - 1]);
}
function Kr(e) {
  return this.l(e).i.length;
}
function Ud(e) {
  const t = this.h(e);
  return [t.era, t.eraYear];
}
function bl(e, t) {
  return Object.keys(e.l(t).u);
}
function Ar(e) {
  return Go(Te(e));
}
function Go(e) {
  if ((e = e.toLowerCase()) !== X && e !== Gn) {
    const t = fc(e).resolvedOptions().calendar;
    if (cn(e) !== cn(t))
      throw new RangeError(tp(e));
    return t;
  }
  return e;
}
function cn(e) {
  return e === "islamicc" && (e = "islamic"), e.split("-")[0];
}
function $d(e, t) {
  return (n) => n === X ? e : n === Gn || n === $t ? Object.assign(Object.create(e), {
    id: n
  }) : Object.assign(Object.create(t), sy(n));
}
function t0(e, t, n, r) {
  const o = Wt(n, r, Pt, [], lp);
  if (o.timeZone !== void 0) {
    const i = n.F(o), a = Ir(o), s = e(o.timeZone);
    return {
      epochNanoseconds: qn(t(s), {
        ...i,
        ...a
      }, o.offset !== void 0 ? pn(o.offset) : void 0),
      timeZone: s
    };
  }
  return {
    ...n.F(o),
    ...Be
  };
}
function n0(e, t, n, r, o, i) {
  const a = Wt(n, o, Pt, sp, lp), s = e(a.timeZone), [c, l, f] = Ro(i), u = n.F(a, xo(c)), d = Ir(a, c);
  return Je(qn(t(s), {
    ...u,
    ...d
  }, a.offset !== void 0 ? pn(a.offset) : void 0, l, f), s, r);
}
function r0(e, t, n) {
  const r = Wt(e, t, Pt, [], jt), o = ee(n);
  return Xe(ze({
    ...e.F(r, xo(o)),
    ...Ir(r, o)
  }));
}
function o0(e, t, n, r = []) {
  const o = Wt(e, t, Pt, r);
  return e.F(o, n);
}
function i0(e, t, n, r) {
  const o = Wt(e, t, Ys, r);
  return e.K(o, n);
}
function a0(e, t, n, r) {
  const o = Wt(e, n, Pt, jr);
  return t && o.month !== void 0 && o.monthCode === void 0 && o.year === void 0 && (o.year = bt), e._(o, r);
}
function s0(e, t) {
  return pt(Ir(He(e, La, [], 1), ee(t)));
}
function c0(e) {
  const t = He(e, Ws);
  return ye(dn({
    ...Ee,
    ...t
  }));
}
function Wt(e, t, n, r = [], o = []) {
  return He(t, [...e.fields(n), ...o].sort(), r);
}
function He(e, t, n, r = !n) {
  const o = {};
  let i, a = 0;
  for (const s of t) {
    if (s === i)
      throw new RangeError(V0(s));
    if (s === "constructor" || s === "__proto__")
      throw new RangeError(G0(s));
    let c = e[s];
    if (c !== void 0)
      a = 1, wl[s] && (c = wl[s](c, s)), o[s] = c;
    else if (n) {
      if (n.includes(s))
        throw new TypeError(Us(s));
      o[s] = dp[s];
    }
    i = s;
  }
  if (r && !a)
    throw new TypeError(Xd(t));
  return o;
}
function Ir(e, t) {
  return Dn(dc({
    ...dp,
    ...e
  }), t);
}
function l0(e, t, n, r, o) {
  const { calendar: i, timeZone: a } = n, s = e(i), c = t(a), l = [...s.fields(Pt), ...cp].sort(), f = ((m) => {
    const y = Ue(m, G), S = Er(y.offsetNanoseconds), v = Xo(m.calendar), [_, E, I] = v.v(y), [k, M] = v.q(_, E), x = Tr(k, M);
    return {
      ...my(y),
      year: _,
      monthCode: x,
      day: I,
      offset: S
    };
  })(n), u = He(r, l), d = s.k(f, u), b = {
    ...f,
    ...u
  }, [h, g, T] = Ro(o, 2);
  return Je(qn(c, {
    ...s.F(d, xo(h)),
    ...Dn(dc(b), h)
  }, pn(b.offset), g, T), a, i);
}
function u0(e, t, n, r) {
  const o = e(t.calendar), i = [...o.fields(Pt), ...jt].sort(), a = {
    ...Gd(s = t),
    hour: s.isoHour,
    minute: s.isoMinute,
    second: s.isoSecond,
    millisecond: s.isoMillisecond,
    microsecond: s.isoMicrosecond,
    nanosecond: s.isoNanosecond
  };
  var s;
  const c = He(n, i), l = ee(r), f = o.k(a, c), u = {
    ...a,
    ...c
  };
  return Xe(ze({
    ...o.F(f, xo(l)),
    ...Dn(dc(u), l)
  }));
}
function f0(e, t, n, r) {
  const o = e(t.calendar), i = o.fields(Pt).sort(), a = Gd(t), s = He(n, i), c = o.k(a, s);
  return o.F(c, r);
}
function d0(e, t, n, r) {
  const o = e(t.calendar), i = o.fields(Ys).sort(), a = ((l) => {
    const f = Xo(l.calendar), [u, d] = f.v(l), [b, h] = f.q(u, d);
    return {
      year: u,
      monthCode: Tr(b, h)
    };
  })(t), s = He(n, i), c = o.k(a, s);
  return o.K(c, r);
}
function p0(e, t, n, r) {
  const o = e(t.calendar), i = o.fields(Pt).sort(), a = ((l) => {
    const f = Xo(l.calendar), [u, d, b] = f.v(l), [h, g] = f.q(u, d);
    return {
      monthCode: Tr(h, g),
      day: b
    };
  })(t), s = He(n, i), c = o.k(a, s);
  return o._(c, r);
}
function h0(e, t, n) {
  return pt(((r, o, i) => Ir({
    ...Ze(La, r),
    ...He(o, La)
  }, ee(i)))(e, t, n));
}
function m0(e, t) {
  return ye((n = e, r = t, dn({
    ...n,
    ...He(r, Ws)
  })));
  var n, r;
}
function Kd(e, t, n, r, o) {
  t = Ze(n = e.fields(n), t), r = He(r, o = e.fields(o), []);
  let i = e.k(t, r);
  return i = He(i, [...n, ...o].sort(), []), e.F(i);
}
function li(e, t) {
  const n = za(e), r = hp[e.id || ""] || {};
  let { era: o, eraYear: i, year: a } = t;
  if (o !== void 0 || i !== void 0) {
    if (o === void 0 || i === void 0)
      throw new TypeError(J0);
    if (!n)
      throw new RangeError(Z0);
    const s = n[r[o] || o];
    if (s === void 0)
      throw new RangeError(Q0(o));
    const c = Bd(i, s);
    if (a !== void 0 && a !== c)
      throw new RangeError(X0);
    a = c;
  } else if (a === void 0)
    throw new TypeError(eg(n));
  return a;
}
function Gr(e, t, n, r) {
  let { month: o, monthCode: i } = t;
  if (i !== void 0) {
    const a = ((s, c, l, f) => {
      const u = s.L(l), [d, b] = Ls(c);
      let h = ho(d, b, u);
      if (b) {
        const g = Fd(s);
        if (g === void 0)
          throw new RangeError(er);
        if (g > 0) {
          if (h > g)
            throw new RangeError(er);
          if (u === void 0) {
            if (f === 1)
              throw new RangeError(er);
            h--;
          }
        } else {
          if (h !== -g)
            throw new RangeError(er);
          if (u === void 0 && f === 1)
            throw new RangeError(er);
        }
      }
      return h;
    })(e, i, n, r);
    if (o !== void 0 && o !== a)
      throw new RangeError(ng);
    o = a, r = 1;
  } else if (o === void 0)
    throw new TypeError(ep);
  return wt("month", o, 1, e.B(n), r);
}
function ui(e, t, n, r, o) {
  return Ce(t, "day", 1, e.U(r, n), o);
}
function fi(e, t, n, r) {
  let o = 0;
  const i = [];
  for (const a of n)
    t[a] !== void 0 ? o = 1 : i.push(a);
  if (Object.assign(e, t), o)
    for (const a of r || i)
      delete e[a];
}
function Gd(e) {
  const t = Xo(e.calendar), [n, r, o] = t.v(e), [i, a] = t.q(n, r);
  return {
    year: n,
    monthCode: Tr(i, a),
    day: o
  };
}
function g0(e) {
  return At(ft(os(ts(e))));
}
function y0(e, t, n, r, o = X) {
  return Je(ft(os(ts(n))), t(r), e(o));
}
function v0(e, t, n, r, o = 0, i = 0, a = 0, s = 0, c = 0, l = 0, f = X) {
  return Xe(ze(ko(Et(Oe, zn(Zo, [t, n, r, o, i, a, s, c, l])))), e(f));
}
function b0(e, t, n, r, o = X) {
  return It(Ve(un(Et(Oe, {
    isoYear: t,
    isoMonth: n,
    isoDay: r
  }))), e(o));
}
function _0(e, t, n, r = X, o = 1) {
  const i = Oe(t), a = Oe(n), s = e(r);
  return fr(as(un({
    isoYear: i,
    isoMonth: a,
    isoDay: Oe(o)
  })), s);
}
function w0(e, t, n, r = X, o = bt) {
  const i = Oe(t), a = Oe(n), s = e(r);
  return uo(Ve(un({
    isoYear: Oe(o),
    isoMonth: i,
    isoDay: a
  })), s);
}
function E0(e = 0, t = 0, n = 0, r = 0, o = 0, i = 0) {
  return pt(Dn(Et(Oe, zn(Qe, [e, t, n, r, o, i])), 1));
}
function S0(e = 0, t = 0, n = 0, r = 0, o = 0, i = 0, a = 0, s = 0, c = 0, l = 0) {
  return ye(dn(Et(ns, zn(oe, [e, t, n, r, o, i, a, s, c, l]))));
}
function T0(e, t, n = X) {
  return Je(e.epochNanoseconds, t, n);
}
function A0(e) {
  return At(e.epochNanoseconds);
}
function Vd(e, t) {
  return Xe(Ue(t, e));
}
function Yd(e, t) {
  return It(Ue(t, e));
}
function Wd(e, t) {
  return pt(Ue(t, e));
}
function I0(e, t, n, r) {
  const o = ((i, a, s, c) => {
    const l = ((f) => Ep(dt(f)))(c);
    return Sr(i(a), s, l);
  })(e, n, t, r);
  return Je(ft(o), n, t.calendar);
}
function O0(e, t, n, r, o) {
  const i = e(o.timeZone), a = o.plainTime, s = a !== void 0 ? t(a) : void 0, c = n(i);
  let l;
  return l = s ? Sr(c, {
    ...r,
    ...s
  }) : Ut(c, {
    ...r,
    ...Be
  }), Je(l, i, r.calendar);
}
function j0(e, t = Be) {
  return Xe(ze({
    ...e,
    ...t
  }));
}
function P0(e, t, n) {
  return ((r, o) => {
    const i = Wt(r, o, up);
    return r.K(i, void 0);
  })(e(t.calendar), n);
}
function k0(e, t, n) {
  return ((r, o) => {
    const i = Wt(r, o, fp);
    return r._(i);
  })(e(t.calendar), n);
}
function R0(e, t, n, r) {
  return ((o, i, a) => Kd(o, i, up, _r(a), jr))(e(t.calendar), n, r);
}
function M0(e, t, n, r) {
  return ((o, i, a) => Kd(o, i, fp, _r(a), Ks))(e(t.calendar), n, r);
}
function C0(e) {
  return At(ft(co(ns(e), Ot)));
}
function x0(e) {
  return At(ft(os(ts(e))));
}
function hn(e, t, n) {
  const r = new Set(n);
  return (o, i) => {
    const a = n && Uc(o, n);
    if (!Uc(o = ((s, c) => {
      const l = {};
      for (const f in c)
        s.has(f) || (l[f] = c[f]);
      return l;
    })(r, o), e)) {
      if (i && a)
        throw new TypeError("Invalid formatting options");
      o = {
        ...t,
        ...o
      };
    }
    return n && (o.timeZone = mn, ["full", "long"].includes(o.J) && (o.J = "medium")), o;
  };
}
function Zt(e, t = Zd, n = 0) {
  const [r, , , o] = e;
  return (i, a = xy, ...s) => {
    const c = t(o && o(...s), i, a, r, n), l = c.resolvedOptions();
    return [c, ...N0(e, l, s)];
  };
}
function Zd(e, t, n, r, o) {
  if (n = r(n, o), e) {
    if (n.timeZone !== void 0)
      throw new TypeError(hg);
    n.timeZone = e;
  }
  return new Ft(t, n);
}
function N0(e, t, n) {
  const [, r, o] = e;
  return n.map(((i) => (i.calendar && ((a, s, c) => {
    if ((c || a !== X) && a !== s)
      throw new RangeError(np);
  })(i.calendar, t.calendar, o), r(i, t))));
}
function z0(e, t, n) {
  const r = t.timeZone, o = e(r), i = {
    ...Ue(t, o),
    ...n || Be
  };
  let a;
  return a = n ? qn(o, i, i.offsetNanoseconds, 2) : Ut(o, i), Je(a, r, t.calendar);
}
function B0(e, t = Be) {
  return Xe(ze({
    ...e,
    ...t
  }));
}
function Hs(e, t) {
  return {
    ...e,
    calendar: t
  };
}
function F0(e, t) {
  return {
    ...e,
    timeZone: t
  };
}
function di(e) {
  const t = Ba();
  return Fn(t, e.R(t));
}
function Ba() {
  return co(Date.now(), Ot);
}
function Qn() {
  return El || (El = new Ft().resolvedOptions().timeZone);
}
const D0 = (e, t) => `Non-integer ${e}: ${t}`, L0 = (e, t) => `Non-positive ${e}: ${t}`, q0 = (e, t) => `Non-finite ${e}: ${t}`, H0 = (e) => `Cannot convert bigint to ${e}`, U0 = (e) => `Invalid bigint: ${e}`, $0 = "Cannot convert Symbol to string", K0 = "Invalid object", Jd = (e, t, n, r, o) => o ? Jd(e, o[t], o[n], o[r]) : Jt(e, t) + `; must be between ${n}-${r}`, Jt = (e, t) => `Invalid ${e}: ${t}`, Us = (e) => `Missing ${e}`, G0 = (e) => `Invalid field ${e}`, V0 = (e) => `Duplicate field ${e}`, Xd = (e) => "No valid fields: " + e.join(), Y0 = "Invalid bag", Qd = (e, t, n) => Jt(e, t) + "; must be " + Object.keys(n).join(), W0 = "Cannot use valueOf", Fa = "Invalid calling context", Z0 = "Forbidden era/eraYear", J0 = "Mismatching era/eraYear", X0 = "Mismatching year/eraYear", Q0 = (e) => `Invalid era: ${e}`, eg = (e) => "Missing year" + (e ? "/era/eraYear" : ""), tg = (e) => `Invalid monthCode: ${e}`, ng = "Mismatching month/monthCode", ep = "Missing month/monthCode", er = "Invalid leap month", Kn = "Invalid protocol results", tp = (e) => Jt("Calendar", e), np = "Mismatching Calendars", rp = (e) => Jt("TimeZone", e), op = "Mismatching TimeZones", rg = "Forbidden ICU TimeZone", og = "Out-of-bounds offset", ig = "Out-of-bounds TimeZone gap", ag = "Invalid TimeZone offset", sg = "Ambiguous offset", Xt = "Out-of-bounds date", cg = "Out-of-bounds duration", lg = "Cannot mix duration signs", Vo = "Missing relativeTo", ug = "Cannot use large units", fg = "Required smallestUnit or largestUnit", dg = "smallestUnit > largestUnit", xe = (e) => `Cannot parse: ${e}`, vt = (e) => `Invalid substring: ${e}`, pg = (e) => `Cannot format ${e}`, pi = "Mismatching types for formatting", hg = "Cannot specify TimeZone", ip = /* @__PURE__ */ J(Ao, ((e, t) => t)), Cn = /* @__PURE__ */ J(Ao, ((e, t, n) => n)), Ye = /* @__PURE__ */ J(so, 2), Da = {
  nanosecond: 0,
  microsecond: 1,
  millisecond: 2,
  second: 3,
  minute: 4,
  hour: 5,
  day: 6,
  week: 7,
  month: 8,
  year: 9
}, $s = /* @__PURE__ */ Object.keys(Da), Ne = 864e5, ap = 1e3, Or = 1e3, Ot = 1e6, it = 1e9, Yo = 6e10, Wo = 36e11, se = 864e11, lt = [1, Or, Ot, it, Yo, Wo, se], jt = /* @__PURE__ */ $s.slice(0, 6), La = /* @__PURE__ */ br(jt), mg = ["offset"], sp = ["timeZone"], cp = /* @__PURE__ */ jt.concat(mg), lp = /* @__PURE__ */ cp.concat(sp), qa = ["era", "eraYear"], gg = /* @__PURE__ */ qa.concat(["year"]), Ks = ["year"], Gs = ["monthCode"], Vs = /* @__PURE__ */ ["month"].concat(Gs), jr = ["day"], Ys = /* @__PURE__ */ Vs.concat(Ks), up = /* @__PURE__ */ Gs.concat(Ks), Pt = /* @__PURE__ */ jr.concat(Ys), yg = /* @__PURE__ */ jr.concat(Vs), fp = /* @__PURE__ */ jr.concat(Gs), dp = /* @__PURE__ */ Cn(jt, 0), X = "iso8601", Gn = "gregory", $t = "japanese", pp = {
  [Gn]: {
    "gregory-inverse": -1,
    gregory: 0
  },
  [$t]: {
    "japanese-inverse": -1,
    japanese: 0,
    meiji: 1867,
    taisho: 1911,
    showa: 1925,
    heisei: 1988,
    reiwa: 2018
  },
  ethiopic: {
    ethioaa: 0,
    ethiopic: 5500
  },
  coptic: {
    "coptic-inverse": -1,
    coptic: 0
  },
  roc: {
    "roc-inverse": -1,
    roc: 0
  },
  buddhist: {
    be: 0
  },
  islamic: {
    ah: 0
  },
  indian: {
    saka: 0
  },
  persian: {
    ap: 0
  }
}, hp = {
  [Gn]: {
    bce: "gregory-inverse",
    ce: "gregory"
  },
  [$t]: {
    bce: "japanese-inverse",
    ce: "japanese"
  },
  ethiopic: {
    era0: "ethioaa",
    era1: "ethiopic"
  },
  coptic: {
    era0: "coptic-inverse",
    era1: "coptic"
  },
  roc: {
    broc: "roc-inverse",
    minguo: "roc"
  }
}, vg = {
  chinese: 13,
  dangi: 13,
  hebrew: -6
}, Te = /* @__PURE__ */ J(Qa, "string"), bg = /* @__PURE__ */ J(Qa, "boolean"), _g = /* @__PURE__ */ J(Qa, "number"), oe = /* @__PURE__ */ $s.map(((e) => e + "s")), Ws = /* @__PURE__ */ br(oe), wg = /* @__PURE__ */ oe.slice(0, 6), mp = /* @__PURE__ */ oe.slice(6), Eg = /* @__PURE__ */ mp.slice(1), Sg = /* @__PURE__ */ ip(oe), Ee = /* @__PURE__ */ Cn(oe, 0), Zs = /* @__PURE__ */ Cn(wg, 0), Js = /* @__PURE__ */ J(Lf, oe), Qe = ["isoNanosecond", "isoMicrosecond", "isoMillisecond", "isoSecond", "isoMinute", "isoHour"], Xs = ["isoDay", "isoMonth", "isoYear"], Zo = /* @__PURE__ */ Qe.concat(Xs), Qs = /* @__PURE__ */ br(Xs), gp = /* @__PURE__ */ br(Qe), Tg = /* @__PURE__ */ br(Zo), Be = /* @__PURE__ */ Cn(gp, 0), Ag = /* @__PURE__ */ J(Lf, Zo), ec = 1e8, tc = ec * Ne, Ig = [ec, 0], Og = [-ec, 0], mr = 275760, gr = -271821, Ft = Intl.DateTimeFormat, yp = "en-GB", jg = 1970, bt = 1972, Ct = 12, Pg = /* @__PURE__ */ Bn(1868, 9, 8), kg = /* @__PURE__ */ Le(fm, WeakMap), go = "smallestUnit", Ha = "unit", sr = "roundingIncrement", hi = "fractionalSecondDigits", vp = "relativeTo", mi = "direction", bp = {
  constrain: 0,
  reject: 1
}, Rg = /* @__PURE__ */ Object.keys(bp), Mg = {
  compatible: 0,
  reject: 1,
  earlier: 2,
  later: 3
}, Cg = {
  reject: 0,
  use: 1,
  prefer: 2,
  ignore: 3
}, xg = {
  auto: 0,
  never: 1,
  critical: 2,
  always: 3
}, Ng = {
  auto: 0,
  never: 1,
  critical: 2
}, zg = {
  auto: 0,
  never: 1
}, Bg = {
  floor: 0,
  halfFloor: 1,
  ceil: 2,
  halfCeil: 3,
  trunc: 4,
  halfTrunc: 5,
  expand: 6,
  halfExpand: 7,
  halfEven: 8
}, Fg = {
  previous: -1,
  next: 1
}, Pr = /* @__PURE__ */ J(ms, go), _p = /* @__PURE__ */ J(ms, "largestUnit"), Dg = /* @__PURE__ */ J(ms, Ha), wp = /* @__PURE__ */ J(Gt, "overflow", bp), Ep = /* @__PURE__ */ J(Gt, "disambiguation", Mg), Lg = /* @__PURE__ */ J(Gt, "offset", Cg), nc = /* @__PURE__ */ J(Gt, "calendarName", xg), qg = /* @__PURE__ */ J(Gt, "timeZoneName", Ng), Hg = /* @__PURE__ */ J(Gt, "offset", zg), kr = /* @__PURE__ */ J(Gt, "roundingMode", Bg), rc = "PlainYearMonth", oc = "PlainMonthDay", Rr = "PlainDate", Vn = "PlainDateTime", ic = "PlainTime", Qt = "ZonedDateTime", ac = "Instant", sc = "Duration", Ug = [Math.floor, (e) => Ur(e) ? Math.floor(e) : Math.round(e), Math.ceil, (e) => Ur(e) ? Math.ceil(e) : Math.round(e), Math.trunc, (e) => Ur(e) ? Math.trunc(e) || 0 : Math.round(e), (e) => e < 0 ? Math.floor(e) : Math.ceil(e), (e) => Math.sign(e) * Math.round(Math.abs(e)) || 0, (e) => Ur(e) ? (e = Math.trunc(e) || 0) + e % 2 : Math.round(e)], mn = "UTC", ro = 5184e3, $g = /* @__PURE__ */ lo(1847), Kg = /* @__PURE__ */ lo(/* @__PURE__ */ (/* @__PURE__ */ new Date()).getUTCFullYear() + 10), Gg = /0+$/, Ue = /* @__PURE__ */ Le(Im, WeakMap), _l = 2 ** 32 - 1, G = /* @__PURE__ */ Le(((e) => {
  const t = zs(e);
  return typeof t == "object" ? new Yg(t) : new Vg(t || 0);
}));
class Vg {
  constructor(t) {
    this.$ = t;
  }
  R() {
    return this.$;
  }
  I(t) {
    return ((n) => {
      const r = be({
        ...n,
        ...Be
      });
      if (!r || Math.abs(r[0]) > 1e8)
        throw new RangeError(Xt);
    })(t), [ss(t, this.$)];
  }
  O() {
  }
}
class Yg {
  constructor(t) {
    this.nn = ((n) => {
      function r(l) {
        const f = ur(l, s, c), [u, d] = ul(f), b = i(u), h = i(d);
        return b === h ? b : o(a(u, d), b, h, l);
      }
      function o(l, f, u, d) {
        let b, h;
        for (; (d === void 0 || (b = d < l[0] ? f : d >= l[1] ? u : void 0) === void 0) && (h = l[1] - l[0]); ) {
          const g = l[0] + Math.floor(h / 2);
          n(g) === u ? l[1] = g : l[0] = g + 1;
        }
        return b;
      }
      const i = Le(n), a = Le(km);
      let s = $g, c = Kg;
      return {
        tn(l) {
          const f = r(l - 86400), u = r(l + 86400), d = l - f, b = l - u;
          if (f === u)
            return [d];
          const h = r(d);
          return h === r(b) ? [l - h] : f > u ? [d, b] : [];
        },
        rn: r,
        O(l, f) {
          const u = ur(l, s, c);
          let [d, b] = ul(u);
          const h = ro * f, g = f < 0 ? () => b > s || (s = u, 0) : () => d < c || (c = u, 0);
          for (; g(); ) {
            const T = i(d), m = i(b);
            if (T !== m) {
              const y = a(d, b);
              o(y, T, m);
              const S = y[0];
              if ((Bt(S, l) || 1) === f)
                return S;
            }
            d += h, b += h;
          }
        }
      };
    })(/* @__PURE__ */ ((n) => (r) => {
      const o = cs(n, r * ap);
      return lo(qd(o), parseInt(o.month), parseInt(o.day), parseInt(o.hour), parseInt(o.minute), parseInt(o.second)) - r;
    })(t));
  }
  R(t) {
    return this.nn.rn(((n) => Gc(n)[0])(t)) * it;
  }
  I(t) {
    const [n, r] = [lo((o = t).isoYear, o.isoMonth, o.isoDay, o.isoHour, o.isoMinute, o.isoSecond), o.isoMillisecond * Ot + o.isoMicrosecond * Or + o.isoNanosecond];
    var o;
    return this.nn.tn(n).map(((i) => ft(an(co(i, it), r))));
  }
  O(t, n) {
    const [r, o] = Gc(t), i = this.nn.O(r + (n > 0 || o ? 1 : 0), n);
    if (i !== void 0)
      return co(i, it);
  }
}
const cc = "([+-])", oo = "(?:[.,](\\d{1,9}))?", Sp = `(?:(?:${cc}(\\d{6}))|(\\d{4}))-?(\\d{2})`, lc = "(\\d{2})(?::?(\\d{2})(?::?(\\d{2})" + oo + ")?)?", uc = cc + lc, Wg = Sp + "-?(\\d{2})(?:[T ]" + lc + "(Z|" + uc + ")?)?", Tp = "\\[(!?)([^\\]]*)\\]", Jo = `((?:${Tp}){0,9})`, Zg = /* @__PURE__ */ Un(Sp + Jo), Jg = /* @__PURE__ */ Un("(?:--)?(\\d{2})-?(\\d{2})" + Jo), Xg = /* @__PURE__ */ Un(Wg + Jo), Qg = /* @__PURE__ */ Un("T?" + lc + "(?:" + uc + ")?" + Jo), ey = /* @__PURE__ */ Un(uc), ty = /* @__PURE__ */ new RegExp(Tp, "g"), ny = /* @__PURE__ */ Un(`${cc}?P(\\d+Y)?(\\d+M)?(\\d+W)?(\\d+D)?(?:T(?:(\\d+)${oo}H)?(?:(\\d+)${oo}M)?(?:(\\d+)${oo}S)?)?`), ry = /* @__PURE__ */ Le(((e) => new Ft(yp, {
  timeZone: e,
  era: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric"
}))), oy = /^(AC|AE|AG|AR|AS|BE|BS|CA|CN|CS|CT|EA|EC|IE|IS|JS|MI|NE|NS|PL|PN|PR|PS|SS|VS)T$/, iy = /[^\w\/:+-]+/, ay = /^M(\d{2})(L?)$/, sy = /* @__PURE__ */ Le(Xm), fc = /* @__PURE__ */ Le(((e) => new Ft(yp, {
  calendar: e,
  timeZone: mn,
  era: "short",
  year: "numeric",
  month: "short",
  day: "numeric"
}))), Ap = {
  P(e, t, n) {
    const r = ee(n);
    let o, { years: i, months: a, weeks: s, days: c } = t;
    if (c += we(t, 5)[0], i || a)
      o = ((l, f, u, d, b) => {
        let [h, g, T] = l.v(f);
        if (u) {
          const [m, y] = l.q(h, g);
          h += u, g = ho(m, y, l.L(h)), g = wt("month", g, 1, l.B(h), b);
        }
        return d && ([h, g] = l.un(h, g, d)), T = wt("day", T, 1, l.U(h, g), b), l.p(h, g, T);
      })(this, e, i, a, r);
    else {
      if (!s && !c)
        return e;
      o = je(e);
    }
    if (o === void 0)
      throw new RangeError(Xt);
    return o += (7 * s + c) * Ne, Ve(Po(o));
  },
  N(e, t, n) {
    if (n <= 7) {
      let c = 0, l = xd({
        ...e,
        ...Be
      }, {
        ...t,
        ...Be
      });
      return n === 7 && ([c, l] = Lt(l, 7)), {
        ...Ee,
        weeks: c,
        days: l
      };
    }
    const r = this.v(e), o = this.v(t);
    let [i, a, s] = ((c, l, f, u, d, b, h) => {
      let g = d - l, T = b - f, m = h - u;
      if (g || T) {
        const y = Math.sign(g || T);
        let S = c.U(d, b), v = 0;
        if (Math.sign(m) === -y) {
          const _ = S;
          [d, b] = c.un(d, b, -y), g = d - l, T = b - f, S = c.U(d, b), v = y < 0 ? -_ : S;
        }
        if (m = h - Math.min(u, S) + v, g) {
          const [_, E] = c.q(l, f), [I, k] = c.q(d, b);
          if (T = I - _ || Number(k) - Number(E), Math.sign(T) === -y) {
            const M = y < 0 && -c.B(d);
            g = (d -= y) - l, T = b - ho(_, E, c.L(d)) + (M || c.B(d));
          }
        }
      }
      return [g, T, m];
    })(this, ...r, ...o);
    return n === 8 && (a += this.cn(i, r[0]), i = 0), {
      ...Ee,
      years: i,
      months: a,
      days: s
    };
  },
  F(e, t) {
    const n = ee(t), r = li(this, e), o = Gr(this, e, r, n), i = ui(this, e, o, r, n);
    return It(Ve(this.V(r, o, i)), this.id || X);
  },
  K(e, t) {
    const n = ee(t), r = li(this, e), o = Gr(this, e, r, n);
    return fr(as(this.V(r, o, 1)), this.id || X);
  },
  _(e, t) {
    const n = ee(t);
    let r, o, i, a = e.eraYear !== void 0 || e.year !== void 0 ? li(this, e) : void 0;
    const s = !this.id;
    if (a === void 0 && s && (a = bt), a !== void 0) {
      const u = Gr(this, e, a, n);
      r = ui(this, e, u, a, n);
      const d = this.L(a);
      o = qs(u, d), i = u === d;
    } else {
      if (e.monthCode === void 0)
        throw new TypeError(ep);
      if ([o, i] = Ls(e.monthCode), this.id && this.id !== Gn && this.id !== $t)
        if (this.id && cn(this.id) === "coptic" && n === 0) {
          const u = i || o !== 13 ? 30 : 6;
          r = e.day, r = ur(r, 1, u);
        } else if (this.id && cn(this.id) === "chinese" && n === 0) {
          const u = !i || o !== 1 && o !== 9 && o !== 10 && o !== 11 && o !== 12 ? 30 : 29;
          r = e.day, r = ur(r, 1, u);
        } else
          r = e.day;
      else
        r = ui(this, e, Gr(this, e, bt, n), bt, n);
    }
    const c = this.G(o, i, r);
    if (!c)
      throw new RangeError("Cannot guess year");
    const [l, f] = c;
    return uo(Ve(this.V(l, f, r)), this.id || X);
  },
  fields(e) {
    return za(this) && e.includes("year") ? [...e, ...qa] : e;
  },
  k(e, t) {
    const n = Object.assign(/* @__PURE__ */ Object.create(null), e);
    return fi(n, t, Vs), za(this) && (fi(n, t, gg), this.id === $t && fi(n, t, yg, qa)), n;
  },
  inLeapYear(e) {
    const [t] = this.v(e);
    return this.sn(t);
  },
  monthsInYear(e) {
    const [t] = this.v(e);
    return this.B(t);
  },
  daysInMonth(e) {
    const [t, n] = this.v(e);
    return this.U(t, n);
  },
  daysInYear(e) {
    const [t] = this.v(e);
    return this.fn(t);
  },
  dayOfYear: Ds,
  era(e) {
    return this.hn(e)[0];
  },
  eraYear(e) {
    return this.hn(e)[1];
  },
  monthCode(e) {
    const [t, n] = this.v(e), [r, o] = this.q(t, n);
    return Tr(r, o);
  },
  dayOfWeek: Qf,
  daysInWeek() {
    return 7;
  }
}, cy = {
  v: ls,
  hn: ed,
  q: Wf
}, ly = {
  dayOfYear: Ds,
  v: ls,
  p: Bn
}, uy = /* @__PURE__ */ Object.assign({}, ly, {
  weekOfYear: Nd,
  yearOfWeek: zd,
  m(e) {
    function t(b) {
      return (7 - b < r ? 7 : 0) - b;
    }
    function n(b) {
      const h = Xf(d + b), g = b || 1, T = t(ar(c + h * g, 7));
      return f = (h + (T - l) * g) / 7;
    }
    const r = this.id ? 1 : 4, o = Qf(e), i = this.dayOfYear(e), a = ar(o - 1, 7), s = i - 1, c = ar(a - s, 7), l = t(c);
    let f, u = Math.floor((s - l) / 7) + 1, d = e.isoYear;
    return u ? u > n(0) && (u = 1, d++) : (u = n(-1), d--), [u, d, f];
  }
}), fy = /* @__PURE__ */ Object.assign({}, Ap, uy, {
  v: ls,
  hn: ed,
  q: Wf,
  G(e, t) {
    if (!t)
      return [bt, e];
  },
  sn: us,
  L() {
  },
  B: Zf,
  cn: (e) => e * Ct,
  U: Jf,
  fn: Xf,
  V: (e, t, n) => ({
    isoYear: e,
    isoMonth: t,
    isoDay: n
  }),
  p: Bn,
  un: (e, t, n) => (e += Io(n, Ct), (t += Ja(n, Ct)) < 1 ? (e--, t += Ct) : t > Ct && (e++, t -= Ct), [e, t]),
  year(e) {
    return e.isoYear;
  },
  month(e) {
    return e.isoMonth;
  },
  day: (e) => e.isoDay
}), dy = {
  v: mo,
  hn: Ud,
  q: Hd
}, py = {
  dayOfYear: Ds,
  v: mo,
  p: hr,
  weekOfYear: Nd,
  yearOfWeek: zd,
  m() {
    return [];
  }
}, hy = /* @__PURE__ */ Object.assign({}, Ap, py, {
  v: mo,
  hn: Ud,
  q: Hd,
  G(e, t, n) {
    const r = this.id && cn(this.id) === "chinese" ? ((l, f, u) => {
      if (f)
        switch (l) {
          case 1:
            return 1651;
          case 2:
            return u < 30 ? 1947 : 1765;
          case 3:
            return u < 30 ? 1966 : 1955;
          case 4:
            return u < 30 ? 1963 : 1944;
          case 5:
            return u < 30 ? 1971 : 1952;
          case 6:
            return u < 30 ? 1960 : 1941;
          case 7:
            return u < 30 ? 1968 : 1938;
          case 8:
            return u < 30 ? 1957 : 1718;
          case 9:
            return 1832;
          case 10:
            return 1870;
          case 11:
            return 1814;
          case 12:
            return 1890;
        }
      return 1972;
    })(e, t, n) : bt;
    let [o, i, a] = mo.call(this, {
      isoYear: r,
      isoMonth: Ct,
      isoDay: 31
    });
    const s = no.call(this, o), c = i === s;
    (Bt(e, qs(i, s)) || Bt(Number(t), Number(c)) || Bt(n, a)) === 1 && o--;
    for (let l = 0; l < 100; l++) {
      const f = o - l, u = no.call(this, f), d = ho(e, t, u);
      if (t === (d === u) && n <= vl.call(this, f, d))
        return [f, d];
    }
  },
  sn(e) {
    const t = $r.call(this, e);
    return t > $r.call(this, e - 1) && t > $r.call(this, e + 1);
  },
  L: no,
  B: Kr,
  cn(e, t) {
    const n = t + e, r = Math.sign(e), o = r < 0 ? -1 : 0;
    let i = 0;
    for (let a = t; a !== n; a += r)
      i += Kr.call(this, a + o);
    return i;
  },
  U: vl,
  fn: $r,
  V(e, t, n) {
    return Po(hr.call(this, e, t, n));
  },
  p: hr,
  un(e, t, n) {
    if (n) {
      if (t += n, !Number.isSafeInteger(t))
        throw new RangeError(Xt);
      if (n < 0)
        for (; t < 1; )
          t += Kr.call(this, --e);
      else {
        let r;
        for (; t > (r = Kr.call(this, e)); )
          t -= r, e++;
      }
    }
    return [e, t];
  },
  year(e) {
    return this.h(e).year;
  },
  month(e) {
    const { year: t, o: n } = this.h(e), { u: r } = this.l(t);
    return r[n] + 1;
  },
  day(e) {
    return this.h(e).day;
  }
}), Xo = /* @__PURE__ */ $d(cy, dy), H = /* @__PURE__ */ $d(fy, hy), wl = {
  era: to,
  eraYear: Oe,
  year: Oe,
  month: Kc,
  monthCode(e) {
    const t = to(e);
    return Ls(t), t;
  },
  day: Kc,
  .../* @__PURE__ */ Cn(jt, Oe),
  .../* @__PURE__ */ Cn(oe, ns),
  offset(e) {
    const t = to(e);
    return pn(t), t;
  }
}, dc = /* @__PURE__ */ J(Ff, jt, Qe), my = /* @__PURE__ */ J(Ff, Qe, jt), Dt = "numeric", Mr = ["timeZoneName"], Ip = {
  month: Dt,
  day: Dt
}, pc = {
  year: Dt,
  month: Dt
}, hc = /* @__PURE__ */ Object.assign({}, pc, {
  day: Dt
}), mc = {
  hour: Dt,
  minute: Dt,
  second: Dt
}, gc = /* @__PURE__ */ Object.assign({}, hc, mc), gy = /* @__PURE__ */ Object.assign({}, gc, {
  timeZoneName: "short"
}), yy = /* @__PURE__ */ Object.keys(pc), vy = /* @__PURE__ */ Object.keys(Ip), by = /* @__PURE__ */ Object.keys(hc), _y = /* @__PURE__ */ Object.keys(mc), yc = ["dateStyle"], wy = /* @__PURE__ */ yy.concat(yc), Ey = /* @__PURE__ */ vy.concat(yc), vc = /* @__PURE__ */ by.concat(yc, ["weekday"]), Cr = /* @__PURE__ */ _y.concat(["dayPeriod", "timeStyle", "fractionalSecondDigits"]), bc = /* @__PURE__ */ vc.concat(Cr), Sy = /* @__PURE__ */ Mr.concat(Cr), Ty = /* @__PURE__ */ Mr.concat(vc), Ay = /* @__PURE__ */ Mr.concat(["day", "weekday"], Cr), Iy = /* @__PURE__ */ Mr.concat(["year", "weekday"], Cr), Oy = /* @__PURE__ */ hn(bc, gc), jy = /* @__PURE__ */ hn(bc, gy), Py = /* @__PURE__ */ hn(bc, gc, Mr), ky = /* @__PURE__ */ hn(vc, hc, Sy), Ry = /* @__PURE__ */ hn(Cr, mc, Ty), My = /* @__PURE__ */ hn(wy, pc, Ay), Cy = /* @__PURE__ */ hn(Ey, Ip, Iy), xy = {}, Op = new Ft(void 0, {
  calendar: X
}).resolvedOptions().calendar === X, jp = [Oy, gs], Ny = [jy, gs, 0, (e, t) => {
  const n = e.timeZone;
  if (t && t.timeZone !== n)
    throw new RangeError(op);
  return n;
}], Pp = [Py, je], kp = [ky, je], Rp = [Ry, (e) => qt(e) / Ot], Mp = [My, je, Op], Cp = [Cy, je, Op];
let El;
function en(e, t, n, r, o) {
  function i(...c) {
    if (!(this instanceof i))
      throw new TypeError(Fa);
    Al(this, t(...c));
  }
  function a(c, l) {
    return Object.defineProperties((function(...f) {
      return c.call(this, s(this), ...f);
    }), lr(l));
  }
  function s(c) {
    const l = Me(c);
    if (!l || l.branding !== e)
      throw new TypeError(Fa);
    return l;
  }
  return Object.defineProperties(i.prototype, {
    ...cm(Et(a, n)),
    ...kn(Et(a, r)),
    ...Za("Temporal." + e)
  }), Object.defineProperties(i, {
    ...kn(o),
    ...lr(e)
  }), [i, (c) => {
    const l = Object.create(i.prototype);
    return Al(l, c), l;
  }, s];
}
function Yn(e) {
  if (Me(e) || e.calendar !== void 0 || e.timeZone !== void 0)
    throw new TypeError(Y0);
  return e;
}
function xr(e) {
  return xp(e) || X;
}
function xp(e) {
  const { calendar: t } = e;
  if (t !== void 0)
    return Qo(t);
}
function Qo(e) {
  if (ke(e)) {
    const { calendar: t } = Me(e) || {};
    if (!t)
      throw new TypeError(tp(e));
    return t;
  }
  return ((t) => Go(Dm(Te(t))))(e);
}
function _c(e) {
  const t = {};
  for (const n in e)
    t[n] = (r) => {
      const { calendar: o } = r;
      return H(o)[n](r);
    };
  return t;
}
function tn() {
  throw new TypeError(W0);
}
function De(e) {
  if (ke(e)) {
    const { timeZone: t } = Me(e) || {};
    if (!t)
      throw new TypeError(rp(e));
    return t;
  }
  return ((t) => Ns(Lm(Te(t))))(e);
}
function ge(e) {
  if (ke(e)) {
    const t = Me(e);
    return t && t.branding === sc ? t : c0(e);
  }
  return Fm(e);
}
function tr(e) {
  if (e !== void 0) {
    if (ke(e)) {
      const t = Me(e) || {};
      switch (t.branding) {
        case Qt:
        case Rr:
          return t;
        case Vn:
          return It(t);
      }
      const n = xr(e);
      return {
        ...t0(De, G, H(n), e),
        calendar: n
      };
    }
    return Mm(e);
  }
}
function xt(e, t) {
  if (ke(e)) {
    const r = Me(e) || {};
    switch (r.branding) {
      case ic:
        return ee(t), r;
      case Vn:
        return ee(t), pt(r);
      case Qt:
        return ee(t), Wd(G, r);
    }
    return s0(e, t);
  }
  const n = Bm(e);
  return ee(t), n;
}
function wc(e) {
  return e === void 0 ? void 0 : xt(e);
}
function wn(e, t) {
  if (ke(e)) {
    const r = Me(e) || {};
    switch (r.branding) {
      case Vn:
        return ee(t), r;
      case Rr:
        return ee(t), Xe({
          ...r,
          ...Be
        });
      case Qt:
        return ee(t), Vd(G, r);
    }
    return r0(H(xr(e)), e, t);
  }
  const n = xm(e);
  return ee(t), n;
}
function Sl(e, t) {
  if (ke(e)) {
    const r = Me(e);
    if (r && r.branding === oc)
      return ee(t), r;
    const o = xp(e);
    return a0(H(o || X), !o, e, t);
  }
  const n = zm(H, e);
  return ee(t), n;
}
function En(e, t) {
  if (ke(e)) {
    const r = Me(e);
    return r && r.branding === rc ? (ee(t), r) : i0(H(xr(e)), e, t);
  }
  const n = Nm(H, e);
  return ee(t), n;
}
function Sn(e, t) {
  if (ke(e)) {
    const r = Me(e) || {};
    switch (r.branding) {
      case Rr:
        return ee(t), r;
      case Vn:
        return ee(t), It(r);
      case Qt:
        return ee(t), Yd(G, r);
    }
    return o0(H(xr(e)), e, t);
  }
  const n = js(e);
  return ee(t), n;
}
function Tn(e, t) {
  if (ke(e)) {
    const n = Me(e);
    if (n && n.branding === Qt)
      return Ro(t), n;
    const r = xr(e);
    return n0(De, G, H(r), r, e, t);
  }
  return Cm(e, t);
}
function Tl(e) {
  return Et(((t) => (n) => t(Ua(n))), e);
}
function Ua(e) {
  return Ue(e, G);
}
function An(e) {
  if (ke(e)) {
    const t = Me(e);
    if (t)
      switch (t.branding) {
        case ac:
          return t;
        case Qt:
          return At(t.epochNanoseconds);
      }
  }
  return Rm(e);
}
function zy() {
  function e(i, a) {
    return new t(i, a);
  }
  function t(i, a = /* @__PURE__ */ Object.create(null)) {
    vo.set(this, ((s, c) => {
      const l = new Ft(s, c), f = l.resolvedOptions(), u = f.locale, d = Ze(Object.keys(c), f), b = Le(Dy), h = (g, ...T) => {
        if (g) {
          if (T.length !== 2)
            throw new TypeError(pi);
          for (const v of T)
            if (v === void 0)
              throw new TypeError(pi);
        }
        g || T[0] !== void 0 || (T = []);
        const m = T.map(((v) => Me(v) || Number(v)));
        let y, S = 0;
        for (const v of m) {
          const _ = typeof v == "object" ? v.branding : void 0;
          if (S++ && _ !== y)
            throw new TypeError(pi);
          y = _;
        }
        return y ? b(y)(u, d, ...m) : [l, ...m];
      };
      return h.X = l, h;
    })(i, a));
  }
  const n = Ft.prototype, r = Object.getOwnPropertyDescriptors(n), o = Object.getOwnPropertyDescriptors(Ft);
  for (const i in r) {
    const a = r[i], s = i.startsWith("format") && By(i);
    typeof a.value == "function" ? a.value = i === "constructor" ? e : s || Fy(i) : s && (a.get = function() {
      if (!vo.has(this))
        throw new TypeError(Fa);
      return (...c) => s.apply(this, c);
    }, Object.defineProperties(a.get, lr(`get ${i}`)));
  }
  return o.prototype.value = t.prototype = Object.create({}, r), Object.defineProperties(e, o), e;
}
function By(e) {
  return Object.defineProperties((function(...t) {
    const n = vo.get(this), [r, ...o] = n(e.includes("Range"), ...t);
    return r[e](...o);
  }), lr(e));
}
function Fy(e) {
  return Object.defineProperties((function(...t) {
    return vo.get(this).X[e](...t);
  }), lr(e));
}
function Dy(e) {
  const t = Ky[e];
  if (!t)
    throw new TypeError(pg(e));
  return Zt(t, Le(Zd), 1);
}
const yo = /* @__PURE__ */ new WeakMap(), Me = /* @__PURE__ */ yo.get.bind(yo), Al = /* @__PURE__ */ yo.set.bind(yo), Np = {
  era: lm,
  eraYear: Hf,
  year: Xa,
  month: mt,
  daysInMonth: mt,
  daysInYear: mt,
  inLeapYear: bg,
  monthsInYear: mt
}, Ec = {
  monthCode: Te
}, zp = {
  day: mt
}, Ly = {
  dayOfWeek: mt,
  dayOfYear: mt,
  weekOfYear: um,
  yearOfWeek: Hf,
  daysInWeek: mt
}, Sc = /* @__PURE__ */ _c(/* @__PURE__ */ Object.assign({}, Np, Ec, zp, Ly)), qy = /* @__PURE__ */ _c({
  ...Np,
  ...Ec
}), Hy = /* @__PURE__ */ _c({
  ...Ec,
  ...zp
}), Nr = {
  calendarId: (e) => e.calendar
}, Uy = /* @__PURE__ */ Ao(((e) => (t) => t[e]), oe.concat("sign")), Tc = /* @__PURE__ */ Ao(((e, t) => (n) => n[Qe[t]]), jt), Bp = {
  epochMilliseconds: gs,
  epochNanoseconds: pm
}, [$y, de] = en(sc, S0, {
  ...Uy,
  blank: Pm
}, {
  with: (e, t) => de(m0(e, t)),
  negated: (e) => de(Os(e)),
  abs: (e) => de(jm(e)),
  add: (e, t, n) => de(ll(tr, H, G, 0, e, ge(t), n)),
  subtract: (e, t, n) => de(ll(tr, H, G, 1, e, ge(t), n)),
  round: (e, t) => de(Om(tr, H, G, e, t)),
  total: (e, t) => hm(tr, H, G, e, t),
  toLocaleString(e, t, n) {
    return Intl.DurationFormat ? new Intl.DurationFormat(t, n).format(this) : ci(e);
  },
  toString: ci,
  toJSON: (e) => ci(e),
  valueOf: tn
}, {
  from: (e) => de(ge(e)),
  compare: (e, t, n) => Hm(tr, H, G, ge(e), ge(t), n)
}), Ky = {
  Instant: jp,
  PlainDateTime: Pp,
  PlainDate: kp,
  PlainTime: Rp,
  PlainYearMonth: Mp,
  PlainMonthDay: Cp
}, Gy = /* @__PURE__ */ Zt(jp), Vy = /* @__PURE__ */ Zt(Ny), Yy = /* @__PURE__ */ Zt(Pp), Wy = /* @__PURE__ */ Zt(kp), Zy = /* @__PURE__ */ Zt(Rp), Jy = /* @__PURE__ */ Zt(Mp), Xy = /* @__PURE__ */ Zt(Cp), [Qy, zt] = en(ic, E0, Tc, {
  with(e, t, n) {
    return zt(h0(this, Yn(t), n));
  },
  add: (e, t) => zt(cl(0, e, ge(t))),
  subtract: (e, t) => zt(cl(1, e, ge(t))),
  until: (e, t, n) => de(yl(0, e, xt(t), n)),
  since: (e, t, n) => de(yl(1, e, xt(t), n)),
  round: (e, t) => zt(vm(e, t)),
  equals: (e, t) => Wm(e, xt(t)),
  toLocaleString(e, t, n) {
    const [r, o] = Zy(t, n, e);
    return r.format(o);
  },
  toString: tl,
  toJSON: (e) => tl(e),
  valueOf: tn
}, {
  from: (e, t) => zt(xt(e, t)),
  compare: (e, t) => Bs(xt(e), xt(t))
}), [ev, rt] = en(Vn, J(v0, Ar), {
  ...Nr,
  ...Sc,
  ...Tc
}, {
  with: (e, t, n) => rt(u0(H, e, Yn(t), n)),
  withCalendar: (e, t) => rt(Hs(e, Qo(t))),
  withPlainTime: (e, t) => rt(B0(e, wc(t))),
  add: (e, t, n) => rt(il(H, 0, e, ge(t), n)),
  subtract: (e, t, n) => rt(il(H, 1, e, ge(t), n)),
  until: (e, t, n) => de(hl(H, 0, e, wn(t), n)),
  since: (e, t, n) => de(hl(H, 1, e, wn(t), n)),
  round: (e, t) => rt(ym(e, t)),
  equals: (e, t) => Km(e, wn(t)),
  toZonedDateTime: (e, t, n) => Ie(I0(G, e, De(t), n)),
  toPlainDate: (e) => ot(It(e)),
  toPlainTime: (e) => zt(pt(e)),
  toLocaleString(e, t, n) {
    const [r, o] = Yy(t, n, e);
    return r.format(o);
  },
  toString: Jc,
  toJSON: (e) => Jc(e),
  valueOf: tn
}, {
  from: (e, t) => rt(wn(e, t)),
  compare: (e, t) => jd(wn(e), wn(t))
}), [tv, $a] = en(oc, J(w0, Ar), {
  ...Nr,
  ...Hy
}, {
  with: (e, t, n) => $a(p0(H, e, Yn(t), n)),
  equals: (e, t) => Ym(e, Sl(t)),
  toPlainDate(e, t) {
    return ot(M0(H, e, this, t));
  },
  toLocaleString(e, t, n) {
    const [r, o] = Xy(t, n, e);
    return r.format(o);
  },
  toString: el,
  toJSON: (e) => el(e),
  valueOf: tn
}, {
  from: (e, t) => $a(Sl(e, t))
}), [nv, ir] = en(rc, J(_0, Ar), {
  ...Nr,
  ...qy
}, {
  with: (e, t, n) => ir(d0(H, e, Yn(t), n)),
  add: (e, t, n) => ir(sl(H, 0, e, ge(t), n)),
  subtract: (e, t, n) => ir(sl(H, 1, e, ge(t), n)),
  until: (e, t, n) => de(gl(H, 0, e, En(t), n)),
  since: (e, t, n) => de(gl(H, 1, e, En(t), n)),
  equals: (e, t) => Vm(e, En(t)),
  toPlainDate(e, t) {
    return ot(R0(H, e, this, t));
  },
  toLocaleString(e, t, n) {
    const [r, o] = Jy(t, n, e);
    return r.format(o);
  },
  toString: Qc,
  toJSON: (e) => Qc(e),
  valueOf: tn
}, {
  from: (e, t) => ir(En(e, t)),
  compare: (e, t) => $n(En(e), En(t))
}), [rv, ot] = en(Rr, J(b0, Ar), {
  ...Nr,
  ...Sc
}, {
  with: (e, t, n) => ot(f0(H, e, Yn(t), n)),
  withCalendar: (e, t) => ot(Hs(e, Qo(t))),
  add: (e, t, n) => ot(al(H, 0, e, ge(t), n)),
  subtract: (e, t, n) => ot(al(H, 1, e, ge(t), n)),
  until: (e, t, n) => de(ml(H, 0, e, Sn(t), n)),
  since: (e, t, n) => de(ml(H, 1, e, Sn(t), n)),
  equals: (e, t) => Gm(e, Sn(t)),
  toZonedDateTime(e, t) {
    const n = ke(t) ? t : {
      timeZone: t
    };
    return Ie(O0(De, xt, G, e, n));
  },
  toPlainDateTime: (e, t) => rt(j0(e, wc(t))),
  toPlainYearMonth(e) {
    return ir(P0(H, e, this));
  },
  toPlainMonthDay(e) {
    return $a(k0(H, e, this));
  },
  toLocaleString(e, t, n) {
    const [r, o] = Wy(t, n, e);
    return r.format(o);
  },
  toString: Xc,
  toJSON: (e) => Xc(e),
  valueOf: tn
}, {
  from: (e, t) => ot(Sn(e, t)),
  compare: (e, t) => $n(Sn(e), Sn(t))
}), [ov, Ie] = en(Qt, J(y0, Ar, qm), {
  ...Bp,
  ...Nr,
  ...Tl(Sc),
  ...Tl(Tc),
  offset: (e) => Er(Ua(e).offsetNanoseconds),
  offsetNanoseconds: (e) => Ua(e).offsetNanoseconds,
  timeZoneId: (e) => e.timeZone,
  hoursInDay: (e) => bm(G, e)
}, {
  with: (e, t, n) => Ie(l0(H, G, e, Yn(t), n)),
  withCalendar: (e, t) => Ie(Hs(e, Qo(t))),
  withTimeZone: (e, t) => Ie(F0(e, De(t))),
  withPlainTime: (e, t) => Ie(z0(G, e, wc(t))),
  add: (e, t, n) => Ie(ol(H, G, 0, e, ge(t), n)),
  subtract: (e, t, n) => Ie(ol(H, G, 1, e, ge(t), n)),
  until: (e, t, n) => de(ye(pl(H, G, 0, e, Tn(t), n))),
  since: (e, t, n) => de(ye(pl(H, G, 1, e, Tn(t), n))),
  round: (e, t) => Ie(gm(G, e, t)),
  startOfDay: (e) => Ie(_m(G, e)),
  equals: (e, t) => $m(e, Tn(t)),
  toInstant: (e) => Nt(A0(e)),
  toPlainDateTime: (e) => rt(Vd(G, e)),
  toPlainDate: (e) => ot(Yd(G, e)),
  toPlainTime: (e) => zt(Wd(G, e)),
  toLocaleString(e, t, n = {}) {
    const [r, o] = Vy(t, n, e);
    return r.format(o);
  },
  toString: (e, t) => Zc(G, e, t),
  toJSON: (e) => Zc(G, e),
  valueOf: tn,
  getTimeZoneTransition(e, t) {
    const { timeZone: n, epochNanoseconds: r } = e, o = dm(t), i = G(n).O(r, o);
    return i ? Ie({
      ...e,
      epochNanoseconds: i
    }) : null;
  }
}, {
  from: (e, t) => Ie(Tn(e, t)),
  compare: (e, t) => Od(Tn(e), Tn(t))
}), [iv, Nt] = en(ac, g0, Bp, {
  add: (e, t) => Nt(rl(0, e, ge(t))),
  subtract: (e, t) => Nt(rl(1, e, ge(t))),
  until: (e, t, n) => de(dl(0, e, An(t), n)),
  since: (e, t, n) => de(dl(1, e, An(t), n)),
  round: (e, t) => Nt(mm(e, t)),
  equals: (e, t) => Um(e, An(t)),
  toZonedDateTimeISO: (e, t) => Ie(T0(e, De(t))),
  toLocaleString(e, t, n) {
    const [r, o] = Gy(t, n, e);
    return r.format(o);
  },
  toString: (e, t) => Wc(De, G, e, t),
  toJSON: (e) => Wc(De, G, e),
  valueOf: tn
}, {
  from: (e) => Nt(An(e)),
  fromEpochMilliseconds: (e) => Nt(C0(e)),
  fromEpochNanoseconds: (e) => Nt(x0(e)),
  compare: (e, t) => Id(An(e), An(t))
}), av = /* @__PURE__ */ Object.defineProperties({}, {
  ...Za("Temporal.Now"),
  ...kn({
    timeZoneId: () => Qn(),
    instant: () => Nt(At(Ba())),
    zonedDateTimeISO: (e = Qn()) => Ie(Je(Ba(), De(e), X)),
    plainDateTimeISO: (e = Qn()) => rt(Xe(di(G(De(e))), X)),
    plainDateISO: (e = Qn()) => ot(It(di(G(De(e))), X)),
    plainTimeISO: (e = Qn()) => zt(pt(di(G(De(e)))))
  })
}), sv = /* @__PURE__ */ Object.defineProperties({}, {
  ...Za("Temporal"),
  ...kn({
    PlainYearMonth: nv,
    PlainMonthDay: tv,
    PlainDate: rv,
    PlainTime: Qy,
    PlainDateTime: ev,
    ZonedDateTime: ov,
    Instant: iv,
    Duration: $y,
    Now: av
  })
}), cv = /* @__PURE__ */ zy(), vo = /* @__PURE__ */ new WeakMap();
Object.create(Intl), kn({
  DateTimeFormat: cv
});
function lv(e) {
  const t = e < 0;
  e = Math.abs(e);
  const n = Math.floor(e / 3600).toFixed(0).padStart(2, "0"), r = Math.floor(e % 3600 / 60).toFixed(0).padStart(2, "0"), o = Math.floor(e % 3600 % 60).toFixed(0).padStart(2, "0");
  let i = "";
  return n !== "00" && (i += `${n}:`), i += `${r}:${o}`, t && (i = "-" + i), i;
}
function Il({ seconds: e, className: t, ...n }) {
  const r = at(() => Math.floor(e), [e]), o = at(() => uv(r), [r]);
  return /* @__PURE__ */ p.createElement(
    "time",
    {
      dateTime: o,
      className: _e("mx_Clock", t),
      ...n
    },
    lv(e)
  );
}
function uv(e) {
  if (!isNaN(e))
    return new sv.Duration(0, 0, 0, 0, 0, 0, Math.round(e)).round({ smallestUnit: "seconds", largestUnit: "hours" }).toString();
}
var Fp = typeof global == "object" && global && global.Object === Object && global, fv = typeof self == "object" && self && self.Object === Object && self, et = Fp || fv || Function("return this")(), $e = et.Symbol, Dp = Object.prototype, dv = Dp.hasOwnProperty, pv = Dp.toString, nr = $e ? $e.toStringTag : void 0;
function hv(e) {
  var t = dv.call(e, nr), n = e[nr];
  try {
    e[nr] = void 0;
    var r = !0;
  } catch {
  }
  var o = pv.call(e);
  return r && (t ? e[nr] = n : delete e[nr]), o;
}
var mv = Object.prototype, gv = mv.toString;
function yv(e) {
  return gv.call(e);
}
var vv = "[object Null]", bv = "[object Undefined]", Ol = $e ? $e.toStringTag : void 0;
function gn(e) {
  return e == null ? e === void 0 ? bv : vv : Ol && Ol in Object(e) ? hv(e) : yv(e);
}
function St(e) {
  return e != null && typeof e == "object";
}
var _v = "[object Symbol]";
function ei(e) {
  return typeof e == "symbol" || St(e) && gn(e) == _v;
}
function Lp(e, t) {
  for (var n = -1, r = e == null ? 0 : e.length, o = Array(r); ++n < r; )
    o[n] = t(e[n], n, e);
  return o;
}
var Tt = Array.isArray, jl = $e ? $e.prototype : void 0, Pl = jl ? jl.toString : void 0;
function qp(e) {
  if (typeof e == "string")
    return e;
  if (Tt(e))
    return Lp(e, qp) + "";
  if (ei(e))
    return Pl ? Pl.call(e) : "";
  var t = e + "";
  return t == "0" && 1 / e == -1 / 0 ? "-0" : t;
}
var wv = /\s/;
function Ev(e) {
  for (var t = e.length; t-- && wv.test(e.charAt(t)); )
    ;
  return t;
}
var Sv = /^\s+/;
function Tv(e) {
  return e && e.slice(0, Ev(e) + 1).replace(Sv, "");
}
function Kt(e) {
  var t = typeof e;
  return e != null && (t == "object" || t == "function");
}
var kl = NaN, Av = /^[-+]0x[0-9a-f]+$/i, Iv = /^0b[01]+$/i, Ov = /^0o[0-7]+$/i, jv = parseInt;
function Rl(e) {
  if (typeof e == "number")
    return e;
  if (ei(e))
    return kl;
  if (Kt(e)) {
    var t = typeof e.valueOf == "function" ? e.valueOf() : e;
    e = Kt(t) ? t + "" : t;
  }
  if (typeof e != "string")
    return e === 0 ? e : +e;
  e = Tv(e);
  var n = Iv.test(e);
  return n || Ov.test(e) ? jv(e.slice(2), n ? 2 : 8) : Av.test(e) ? kl : +e;
}
function Pv(e) {
  return e;
}
var kv = "[object AsyncFunction]", Rv = "[object Function]", Mv = "[object GeneratorFunction]", Cv = "[object Proxy]";
function Hp(e) {
  if (!Kt(e))
    return !1;
  var t = gn(e);
  return t == Rv || t == Mv || t == kv || t == Cv;
}
var gi = et["__core-js_shared__"], Ml = (function() {
  var e = /[^.]+$/.exec(gi && gi.keys && gi.keys.IE_PROTO || "");
  return e ? "Symbol(src)_1." + e : "";
})();
function xv(e) {
  return !!Ml && Ml in e;
}
var Nv = Function.prototype, zv = Nv.toString;
function yn(e) {
  if (e != null) {
    try {
      return zv.call(e);
    } catch {
    }
    try {
      return e + "";
    } catch {
    }
  }
  return "";
}
var Bv = /[\\^$.*+?()[\]{}|]/g, Fv = /^\[object .+?Constructor\]$/, Dv = Function.prototype, Lv = Object.prototype, qv = Dv.toString, Hv = Lv.hasOwnProperty, Uv = RegExp(
  "^" + qv.call(Hv).replace(Bv, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
);
function $v(e) {
  if (!Kt(e) || xv(e))
    return !1;
  var t = Hp(e) ? Uv : Fv;
  return t.test(yn(e));
}
function Kv(e, t) {
  return e?.[t];
}
function vn(e, t) {
  var n = Kv(e, t);
  return $v(n) ? n : void 0;
}
var Ka = vn(et, "WeakMap");
function Gv(e, t, n) {
  switch (n.length) {
    case 0:
      return e.call(t);
    case 1:
      return e.call(t, n[0]);
    case 2:
      return e.call(t, n[0], n[1]);
    case 3:
      return e.call(t, n[0], n[1], n[2]);
  }
  return e.apply(t, n);
}
var Vv = 800, Yv = 16, Wv = Date.now;
function Zv(e) {
  var t = 0, n = 0;
  return function() {
    var r = Wv(), o = Yv - (r - n);
    if (n = r, o > 0) {
      if (++t >= Vv)
        return arguments[0];
    } else
      t = 0;
    return e.apply(void 0, arguments);
  };
}
function Jv(e) {
  return function() {
    return e;
  };
}
var bo = (function() {
  try {
    var e = vn(Object, "defineProperty");
    return e({}, "", {}), e;
  } catch {
  }
})(), Xv = bo ? function(e, t) {
  return bo(e, "toString", {
    configurable: !0,
    enumerable: !1,
    value: Jv(t),
    writable: !0
  });
} : Pv, Qv = Zv(Xv);
function e2(e, t) {
  for (var n = -1, r = e == null ? 0 : e.length; ++n < r && t(e[n], n, e) !== !1; )
    ;
  return e;
}
var t2 = 9007199254740991, n2 = /^(?:0|[1-9]\d*)$/;
function r2(e, t) {
  var n = typeof e;
  return t = t ?? t2, !!t && (n == "number" || n != "symbol" && n2.test(e)) && e > -1 && e % 1 == 0 && e < t;
}
function Up(e, t, n) {
  t == "__proto__" && bo ? bo(e, t, {
    configurable: !0,
    enumerable: !0,
    value: n,
    writable: !0
  }) : e[t] = n;
}
function Ac(e, t) {
  return e === t || e !== e && t !== t;
}
var o2 = Object.prototype, i2 = o2.hasOwnProperty;
function $p(e, t, n) {
  var r = e[t];
  (!(i2.call(e, t) && Ac(r, n)) || n === void 0 && !(t in e)) && Up(e, t, n);
}
function a2(e, t, n, r) {
  var o = !n;
  n || (n = {});
  for (var i = -1, a = t.length; ++i < a; ) {
    var s = t[i], c = void 0;
    c === void 0 && (c = e[s]), o ? Up(n, s, c) : $p(n, s, c);
  }
  return n;
}
var Cl = Math.max;
function s2(e, t, n) {
  return t = Cl(t === void 0 ? e.length - 1 : t, 0), function() {
    for (var r = arguments, o = -1, i = Cl(r.length - t, 0), a = Array(i); ++o < i; )
      a[o] = r[t + o];
    o = -1;
    for (var s = Array(t + 1); ++o < t; )
      s[o] = r[o];
    return s[t] = n(a), Gv(e, this, s);
  };
}
var c2 = 9007199254740991;
function Kp(e) {
  return typeof e == "number" && e > -1 && e % 1 == 0 && e <= c2;
}
function Gp(e) {
  return e != null && Kp(e.length) && !Hp(e);
}
var l2 = Object.prototype;
function Vp(e) {
  var t = e && e.constructor, n = typeof t == "function" && t.prototype || l2;
  return e === n;
}
function u2(e, t) {
  for (var n = -1, r = Array(e); ++n < e; )
    r[n] = t(n);
  return r;
}
var f2 = "[object Arguments]";
function xl(e) {
  return St(e) && gn(e) == f2;
}
var Yp = Object.prototype, d2 = Yp.hasOwnProperty, p2 = Yp.propertyIsEnumerable, Wp = xl(/* @__PURE__ */ (function() {
  return arguments;
})()) ? xl : function(e) {
  return St(e) && d2.call(e, "callee") && !p2.call(e, "callee");
};
function h2() {
  return !1;
}
var Zp = typeof exports == "object" && exports && !exports.nodeType && exports, Nl = Zp && typeof module == "object" && module && !module.nodeType && module, m2 = Nl && Nl.exports === Zp, zl = m2 ? et.Buffer : void 0, g2 = zl ? zl.isBuffer : void 0, _o = g2 || h2, y2 = "[object Arguments]", v2 = "[object Array]", b2 = "[object Boolean]", _2 = "[object Date]", w2 = "[object Error]", E2 = "[object Function]", S2 = "[object Map]", T2 = "[object Number]", A2 = "[object Object]", I2 = "[object RegExp]", O2 = "[object Set]", j2 = "[object String]", P2 = "[object WeakMap]", k2 = "[object ArrayBuffer]", R2 = "[object DataView]", M2 = "[object Float32Array]", C2 = "[object Float64Array]", x2 = "[object Int8Array]", N2 = "[object Int16Array]", z2 = "[object Int32Array]", B2 = "[object Uint8Array]", F2 = "[object Uint8ClampedArray]", D2 = "[object Uint16Array]", L2 = "[object Uint32Array]", ne = {};
ne[M2] = ne[C2] = ne[x2] = ne[N2] = ne[z2] = ne[B2] = ne[F2] = ne[D2] = ne[L2] = !0;
ne[y2] = ne[v2] = ne[k2] = ne[b2] = ne[R2] = ne[_2] = ne[w2] = ne[E2] = ne[S2] = ne[T2] = ne[A2] = ne[I2] = ne[O2] = ne[j2] = ne[P2] = !1;
function q2(e) {
  return St(e) && Kp(e.length) && !!ne[gn(e)];
}
function Ic(e) {
  return function(t) {
    return e(t);
  };
}
var Jp = typeof exports == "object" && exports && !exports.nodeType && exports, cr = Jp && typeof module == "object" && module && !module.nodeType && module, H2 = cr && cr.exports === Jp, yi = H2 && Fp.process, xn = (function() {
  try {
    var e = cr && cr.require && cr.require("util").types;
    return e || yi && yi.binding && yi.binding("util");
  } catch {
  }
})(), Bl = xn && xn.isTypedArray, Xp = Bl ? Ic(Bl) : q2, U2 = Object.prototype, $2 = U2.hasOwnProperty;
function Qp(e, t) {
  var n = Tt(e), r = !n && Wp(e), o = !n && !r && _o(e), i = !n && !r && !o && Xp(e), a = n || r || o || i, s = a ? u2(e.length, String) : [], c = s.length;
  for (var l in e)
    (t || $2.call(e, l)) && !(a && // Safari 9 has enumerable `arguments.length` in strict mode.
    (l == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
    o && (l == "offset" || l == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
    i && (l == "buffer" || l == "byteLength" || l == "byteOffset") || // Skip index properties.
    r2(l, c))) && s.push(l);
  return s;
}
function e1(e, t) {
  return function(n) {
    return e(t(n));
  };
}
var K2 = e1(Object.keys, Object), G2 = Object.prototype, V2 = G2.hasOwnProperty;
function Y2(e) {
  if (!Vp(e))
    return K2(e);
  var t = [];
  for (var n in Object(e))
    V2.call(e, n) && n != "constructor" && t.push(n);
  return t;
}
function W2(e) {
  return Gp(e) ? Qp(e) : Y2(e);
}
function Z2(e) {
  var t = [];
  if (e != null)
    for (var n in Object(e))
      t.push(n);
  return t;
}
var J2 = Object.prototype, X2 = J2.hasOwnProperty;
function Q2(e) {
  if (!Kt(e))
    return Z2(e);
  var t = Vp(e), n = [];
  for (var r in e)
    r == "constructor" && (t || !X2.call(e, r)) || n.push(r);
  return n;
}
function eb(e) {
  return Gp(e) ? Qp(e, !0) : Q2(e);
}
var tb = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, nb = /^\w*$/;
function rb(e, t) {
  if (Tt(e))
    return !1;
  var n = typeof e;
  return n == "number" || n == "symbol" || n == "boolean" || e == null || ei(e) ? !0 : nb.test(e) || !tb.test(e) || t != null && e in Object(t);
}
var yr = vn(Object, "create");
function ob() {
  this.__data__ = yr ? yr(null) : {}, this.size = 0;
}
function ib(e) {
  var t = this.has(e) && delete this.__data__[e];
  return this.size -= t ? 1 : 0, t;
}
var ab = "__lodash_hash_undefined__", sb = Object.prototype, cb = sb.hasOwnProperty;
function lb(e) {
  var t = this.__data__;
  if (yr) {
    var n = t[e];
    return n === ab ? void 0 : n;
  }
  return cb.call(t, e) ? t[e] : void 0;
}
var ub = Object.prototype, fb = ub.hasOwnProperty;
function db(e) {
  var t = this.__data__;
  return yr ? t[e] !== void 0 : fb.call(t, e);
}
var pb = "__lodash_hash_undefined__";
function hb(e, t) {
  var n = this.__data__;
  return this.size += this.has(e) ? 0 : 1, n[e] = yr && t === void 0 ? pb : t, this;
}
function ln(e) {
  var t = -1, n = e == null ? 0 : e.length;
  for (this.clear(); ++t < n; ) {
    var r = e[t];
    this.set(r[0], r[1]);
  }
}
ln.prototype.clear = ob;
ln.prototype.delete = ib;
ln.prototype.get = lb;
ln.prototype.has = db;
ln.prototype.set = hb;
function mb() {
  this.__data__ = [], this.size = 0;
}
function ti(e, t) {
  for (var n = e.length; n--; )
    if (Ac(e[n][0], t))
      return n;
  return -1;
}
var gb = Array.prototype, yb = gb.splice;
function vb(e) {
  var t = this.__data__, n = ti(t, e);
  if (n < 0)
    return !1;
  var r = t.length - 1;
  return n == r ? t.pop() : yb.call(t, n, 1), --this.size, !0;
}
function bb(e) {
  var t = this.__data__, n = ti(t, e);
  return n < 0 ? void 0 : t[n][1];
}
function _b(e) {
  return ti(this.__data__, e) > -1;
}
function wb(e, t) {
  var n = this.__data__, r = ti(n, e);
  return r < 0 ? (++this.size, n.push([e, t])) : n[r][1] = t, this;
}
function kt(e) {
  var t = -1, n = e == null ? 0 : e.length;
  for (this.clear(); ++t < n; ) {
    var r = e[t];
    this.set(r[0], r[1]);
  }
}
kt.prototype.clear = mb;
kt.prototype.delete = vb;
kt.prototype.get = bb;
kt.prototype.has = _b;
kt.prototype.set = wb;
var vr = vn(et, "Map");
function Eb() {
  this.size = 0, this.__data__ = {
    hash: new ln(),
    map: new (vr || kt)(),
    string: new ln()
  };
}
function Sb(e) {
  var t = typeof e;
  return t == "string" || t == "number" || t == "symbol" || t == "boolean" ? e !== "__proto__" : e === null;
}
function ni(e, t) {
  var n = e.__data__;
  return Sb(t) ? n[typeof t == "string" ? "string" : "hash"] : n.map;
}
function Tb(e) {
  var t = ni(this, e).delete(e);
  return this.size -= t ? 1 : 0, t;
}
function Ab(e) {
  return ni(this, e).get(e);
}
function Ib(e) {
  return ni(this, e).has(e);
}
function Ob(e, t) {
  var n = ni(this, e), r = n.size;
  return n.set(e, t), this.size += n.size == r ? 0 : 1, this;
}
function Rt(e) {
  var t = -1, n = e == null ? 0 : e.length;
  for (this.clear(); ++t < n; ) {
    var r = e[t];
    this.set(r[0], r[1]);
  }
}
Rt.prototype.clear = Eb;
Rt.prototype.delete = Tb;
Rt.prototype.get = Ab;
Rt.prototype.has = Ib;
Rt.prototype.set = Ob;
var jb = "Expected a function";
function Oc(e, t) {
  if (typeof e != "function" || t != null && typeof t != "function")
    throw new TypeError(jb);
  var n = function() {
    var r = arguments, o = t ? t.apply(this, r) : r[0], i = n.cache;
    if (i.has(o))
      return i.get(o);
    var a = e.apply(this, r);
    return n.cache = i.set(o, a) || i, a;
  };
  return n.cache = new (Oc.Cache || Rt)(), n;
}
Oc.Cache = Rt;
var Pb = 500;
function kb(e) {
  var t = Oc(e, function(r) {
    return n.size === Pb && n.clear(), r;
  }), n = t.cache;
  return t;
}
var Rb = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g, Mb = /\\(\\)?/g, Cb = kb(function(e) {
  var t = [];
  return e.charCodeAt(0) === 46 && t.push(""), e.replace(Rb, function(n, r, o, i) {
    t.push(o ? i.replace(Mb, "$1") : r || n);
  }), t;
});
function xb(e) {
  return e == null ? "" : qp(e);
}
function jc(e, t) {
  return Tt(e) ? e : rb(e, t) ? [e] : Cb(xb(e));
}
function t1(e) {
  if (typeof e == "string" || ei(e))
    return e;
  var t = e + "";
  return t == "0" && 1 / e == -1 / 0 ? "-0" : t;
}
function Nb(e, t) {
  t = jc(t, e);
  for (var n = 0, r = t.length; e != null && n < r; )
    e = e[t1(t[n++])];
  return n && n == r ? e : void 0;
}
function Pc(e, t) {
  for (var n = -1, r = t.length, o = e.length; ++n < r; )
    e[o + n] = t[n];
  return e;
}
var Fl = $e ? $e.isConcatSpreadable : void 0;
function zb(e) {
  return Tt(e) || Wp(e) || !!(Fl && e && e[Fl]);
}
function Bb(e, t, n, r, o) {
  var i = -1, a = e.length;
  for (n || (n = zb), o || (o = []); ++i < a; ) {
    var s = e[i];
    n(s) ? Pc(o, s) : o[o.length] = s;
  }
  return o;
}
function Fb(e) {
  var t = e == null ? 0 : e.length;
  return t ? Bb(e) : [];
}
function Db(e) {
  return Qv(s2(e, void 0, Fb), e + "");
}
var n1 = e1(Object.getPrototypeOf, Object), Lb = "[object Object]", qb = Function.prototype, Hb = Object.prototype, r1 = qb.toString, Ub = Hb.hasOwnProperty, $b = r1.call(Object);
function Kb(e) {
  if (!St(e) || gn(e) != Lb)
    return !1;
  var t = n1(e);
  if (t === null)
    return !0;
  var n = Ub.call(t, "constructor") && t.constructor;
  return typeof n == "function" && n instanceof n && r1.call(n) == $b;
}
function Gb(e, t, n) {
  var r = -1, o = e.length;
  t < 0 && (t = -t > o ? 0 : o + t), n = n > o ? o : n, n < 0 && (n += o), o = t > n ? 0 : n - t >>> 0, t >>>= 0;
  for (var i = Array(o); ++r < o; )
    i[r] = e[r + t];
  return i;
}
function Vb() {
  this.__data__ = new kt(), this.size = 0;
}
function Yb(e) {
  var t = this.__data__, n = t.delete(e);
  return this.size = t.size, n;
}
function Wb(e) {
  return this.__data__.get(e);
}
function Zb(e) {
  return this.__data__.has(e);
}
var Jb = 200;
function Xb(e, t) {
  var n = this.__data__;
  if (n instanceof kt) {
    var r = n.__data__;
    if (!vr || r.length < Jb - 1)
      return r.push([e, t]), this.size = ++n.size, this;
    n = this.__data__ = new Rt(r);
  }
  return n.set(e, t), this.size = n.size, this;
}
function _t(e) {
  var t = this.__data__ = new kt(e);
  this.size = t.size;
}
_t.prototype.clear = Vb;
_t.prototype.delete = Yb;
_t.prototype.get = Wb;
_t.prototype.has = Zb;
_t.prototype.set = Xb;
var o1 = typeof exports == "object" && exports && !exports.nodeType && exports, Dl = o1 && typeof module == "object" && module && !module.nodeType && module, Qb = Dl && Dl.exports === o1, Ll = Qb ? et.Buffer : void 0;
Ll && Ll.allocUnsafe;
function e_(e, t) {
  return e.slice();
}
function t_(e, t) {
  for (var n = -1, r = e == null ? 0 : e.length, o = 0, i = []; ++n < r; ) {
    var a = e[n];
    t(a, n, e) && (i[o++] = a);
  }
  return i;
}
function i1() {
  return [];
}
var n_ = Object.prototype, r_ = n_.propertyIsEnumerable, ql = Object.getOwnPropertySymbols, a1 = ql ? function(e) {
  return e == null ? [] : (e = Object(e), t_(ql(e), function(t) {
    return r_.call(e, t);
  }));
} : i1, o_ = Object.getOwnPropertySymbols, i_ = o_ ? function(e) {
  for (var t = []; e; )
    Pc(t, a1(e)), e = n1(e);
  return t;
} : i1;
function s1(e, t, n) {
  var r = t(e);
  return Tt(e) ? r : Pc(r, n(e));
}
function Hl(e) {
  return s1(e, W2, a1);
}
function c1(e) {
  return s1(e, eb, i_);
}
var Ga = vn(et, "DataView"), Va = vn(et, "Promise"), Ya = vn(et, "Set"), Ul = "[object Map]", a_ = "[object Object]", $l = "[object Promise]", Kl = "[object Set]", Gl = "[object WeakMap]", Vl = "[object DataView]", s_ = yn(Ga), c_ = yn(vr), l_ = yn(Va), u_ = yn(Ya), f_ = yn(Ka), Ge = gn;
(Ga && Ge(new Ga(new ArrayBuffer(1))) != Vl || vr && Ge(new vr()) != Ul || Va && Ge(Va.resolve()) != $l || Ya && Ge(new Ya()) != Kl || Ka && Ge(new Ka()) != Gl) && (Ge = function(e) {
  var t = gn(e), n = t == a_ ? e.constructor : void 0, r = n ? yn(n) : "";
  if (r)
    switch (r) {
      case s_:
        return Vl;
      case c_:
        return Ul;
      case l_:
        return $l;
      case u_:
        return Kl;
      case f_:
        return Gl;
    }
  return t;
});
var d_ = Object.prototype, p_ = d_.hasOwnProperty;
function h_(e) {
  var t = e.length, n = new e.constructor(t);
  return t && typeof e[0] == "string" && p_.call(e, "index") && (n.index = e.index, n.input = e.input), n;
}
var wo = et.Uint8Array;
function kc(e) {
  var t = new e.constructor(e.byteLength);
  return new wo(t).set(new wo(e)), t;
}
function m_(e, t) {
  var n = kc(e.buffer);
  return new e.constructor(n, e.byteOffset, e.byteLength);
}
var g_ = /\w*$/;
function y_(e) {
  var t = new e.constructor(e.source, g_.exec(e));
  return t.lastIndex = e.lastIndex, t;
}
var Yl = $e ? $e.prototype : void 0, Wl = Yl ? Yl.valueOf : void 0;
function v_(e) {
  return Wl ? Object(Wl.call(e)) : {};
}
function b_(e, t) {
  var n = kc(e.buffer);
  return new e.constructor(n, e.byteOffset, e.length);
}
var __ = "[object Boolean]", w_ = "[object Date]", E_ = "[object Map]", S_ = "[object Number]", T_ = "[object RegExp]", A_ = "[object Set]", I_ = "[object String]", O_ = "[object Symbol]", j_ = "[object ArrayBuffer]", P_ = "[object DataView]", k_ = "[object Float32Array]", R_ = "[object Float64Array]", M_ = "[object Int8Array]", C_ = "[object Int16Array]", x_ = "[object Int32Array]", N_ = "[object Uint8Array]", z_ = "[object Uint8ClampedArray]", B_ = "[object Uint16Array]", F_ = "[object Uint32Array]";
function D_(e, t, n) {
  var r = e.constructor;
  switch (t) {
    case j_:
      return kc(e);
    case __:
    case w_:
      return new r(+e);
    case P_:
      return m_(e);
    case k_:
    case R_:
    case M_:
    case C_:
    case x_:
    case N_:
    case z_:
    case B_:
    case F_:
      return b_(e);
    case E_:
      return new r();
    case S_:
    case I_:
      return new r(e);
    case T_:
      return y_(e);
    case A_:
      return new r();
    case O_:
      return v_(e);
  }
}
var L_ = "[object Map]";
function q_(e) {
  return St(e) && Ge(e) == L_;
}
var Zl = xn && xn.isMap, H_ = Zl ? Ic(Zl) : q_, U_ = "[object Set]";
function $_(e) {
  return St(e) && Ge(e) == U_;
}
var Jl = xn && xn.isSet, K_ = Jl ? Ic(Jl) : $_, l1 = "[object Arguments]", G_ = "[object Array]", V_ = "[object Boolean]", Y_ = "[object Date]", W_ = "[object Error]", u1 = "[object Function]", Z_ = "[object GeneratorFunction]", J_ = "[object Map]", X_ = "[object Number]", f1 = "[object Object]", Q_ = "[object RegExp]", ew = "[object Set]", tw = "[object String]", nw = "[object Symbol]", rw = "[object WeakMap]", ow = "[object ArrayBuffer]", iw = "[object DataView]", aw = "[object Float32Array]", sw = "[object Float64Array]", cw = "[object Int8Array]", lw = "[object Int16Array]", uw = "[object Int32Array]", fw = "[object Uint8Array]", dw = "[object Uint8ClampedArray]", pw = "[object Uint16Array]", hw = "[object Uint32Array]", Q = {};
Q[l1] = Q[G_] = Q[ow] = Q[iw] = Q[V_] = Q[Y_] = Q[aw] = Q[sw] = Q[cw] = Q[lw] = Q[uw] = Q[J_] = Q[X_] = Q[f1] = Q[Q_] = Q[ew] = Q[tw] = Q[nw] = Q[fw] = Q[dw] = Q[pw] = Q[hw] = !0;
Q[W_] = Q[u1] = Q[rw] = !1;
function io(e, t, n, r, o, i) {
  var a;
  if (n && (a = o ? n(e, r, o, i) : n(e)), a !== void 0)
    return a;
  if (!Kt(e))
    return e;
  var s = Tt(e);
  if (s)
    a = h_(e);
  else {
    var c = Ge(e), l = c == u1 || c == Z_;
    if (_o(e))
      return e_(e);
    if (c == f1 || c == l1 || l && !o)
      a = {};
    else {
      if (!Q[c])
        return o ? e : {};
      a = D_(e, c);
    }
  }
  i || (i = new _t());
  var f = i.get(e);
  if (f)
    return f;
  i.set(e, a), K_(e) ? e.forEach(function(b) {
    a.add(io(b, t, n, b, e, i));
  }) : H_(e) && e.forEach(function(b, h) {
    a.set(h, io(b, t, n, h, e, i));
  });
  var u = c1, d = s ? void 0 : u(e);
  return e2(d || e, function(b, h) {
    d && (h = b, b = e[h]), $p(a, h, io(b, t, n, h, e, i));
  }), a;
}
var mw = "__lodash_hash_undefined__";
function gw(e) {
  return this.__data__.set(e, mw), this;
}
function yw(e) {
  return this.__data__.has(e);
}
function Eo(e) {
  var t = -1, n = e == null ? 0 : e.length;
  for (this.__data__ = new Rt(); ++t < n; )
    this.add(e[t]);
}
Eo.prototype.add = Eo.prototype.push = gw;
Eo.prototype.has = yw;
function vw(e, t) {
  for (var n = -1, r = e == null ? 0 : e.length; ++n < r; )
    if (t(e[n], n, e))
      return !0;
  return !1;
}
function bw(e, t) {
  return e.has(t);
}
var _w = 1, ww = 2;
function d1(e, t, n, r, o, i) {
  var a = n & _w, s = e.length, c = t.length;
  if (s != c && !(a && c > s))
    return !1;
  var l = i.get(e), f = i.get(t);
  if (l && f)
    return l == t && f == e;
  var u = -1, d = !0, b = n & ww ? new Eo() : void 0;
  for (i.set(e, t), i.set(t, e); ++u < s; ) {
    var h = e[u], g = t[u];
    if (r)
      var T = a ? r(g, h, u, t, e, i) : r(h, g, u, e, t, i);
    if (T !== void 0) {
      if (T)
        continue;
      d = !1;
      break;
    }
    if (b) {
      if (!vw(t, function(m, y) {
        if (!bw(b, y) && (h === m || o(h, m, n, r, i)))
          return b.push(y);
      })) {
        d = !1;
        break;
      }
    } else if (!(h === g || o(h, g, n, r, i))) {
      d = !1;
      break;
    }
  }
  return i.delete(e), i.delete(t), d;
}
function Ew(e) {
  var t = -1, n = Array(e.size);
  return e.forEach(function(r, o) {
    n[++t] = [o, r];
  }), n;
}
function Sw(e) {
  var t = -1, n = Array(e.size);
  return e.forEach(function(r) {
    n[++t] = r;
  }), n;
}
var Tw = 1, Aw = 2, Iw = "[object Boolean]", Ow = "[object Date]", jw = "[object Error]", Pw = "[object Map]", kw = "[object Number]", Rw = "[object RegExp]", Mw = "[object Set]", Cw = "[object String]", xw = "[object Symbol]", Nw = "[object ArrayBuffer]", zw = "[object DataView]", Xl = $e ? $e.prototype : void 0, vi = Xl ? Xl.valueOf : void 0;
function Bw(e, t, n, r, o, i, a) {
  switch (n) {
    case zw:
      if (e.byteLength != t.byteLength || e.byteOffset != t.byteOffset)
        return !1;
      e = e.buffer, t = t.buffer;
    case Nw:
      return !(e.byteLength != t.byteLength || !i(new wo(e), new wo(t)));
    case Iw:
    case Ow:
    case kw:
      return Ac(+e, +t);
    case jw:
      return e.name == t.name && e.message == t.message;
    case Rw:
    case Cw:
      return e == t + "";
    case Pw:
      var s = Ew;
    case Mw:
      var c = r & Tw;
      if (s || (s = Sw), e.size != t.size && !c)
        return !1;
      var l = a.get(e);
      if (l)
        return l == t;
      r |= Aw, a.set(e, t);
      var f = d1(s(e), s(t), r, o, i, a);
      return a.delete(e), f;
    case xw:
      if (vi)
        return vi.call(e) == vi.call(t);
  }
  return !1;
}
var Fw = 1, Dw = Object.prototype, Lw = Dw.hasOwnProperty;
function qw(e, t, n, r, o, i) {
  var a = n & Fw, s = Hl(e), c = s.length, l = Hl(t), f = l.length;
  if (c != f && !a)
    return !1;
  for (var u = c; u--; ) {
    var d = s[u];
    if (!(a ? d in t : Lw.call(t, d)))
      return !1;
  }
  var b = i.get(e), h = i.get(t);
  if (b && h)
    return b == t && h == e;
  var g = !0;
  i.set(e, t), i.set(t, e);
  for (var T = a; ++u < c; ) {
    d = s[u];
    var m = e[d], y = t[d];
    if (r)
      var S = a ? r(y, m, d, t, e, i) : r(m, y, d, e, t, i);
    if (!(S === void 0 ? m === y || o(m, y, n, r, i) : S)) {
      g = !1;
      break;
    }
    T || (T = d == "constructor");
  }
  if (g && !T) {
    var v = e.constructor, _ = t.constructor;
    v != _ && "constructor" in e && "constructor" in t && !(typeof v == "function" && v instanceof v && typeof _ == "function" && _ instanceof _) && (g = !1);
  }
  return i.delete(e), i.delete(t), g;
}
var Hw = 1, Ql = "[object Arguments]", eu = "[object Array]", Vr = "[object Object]", Uw = Object.prototype, tu = Uw.hasOwnProperty;
function $w(e, t, n, r, o, i) {
  var a = Tt(e), s = Tt(t), c = a ? eu : Ge(e), l = s ? eu : Ge(t);
  c = c == Ql ? Vr : c, l = l == Ql ? Vr : l;
  var f = c == Vr, u = l == Vr, d = c == l;
  if (d && _o(e)) {
    if (!_o(t))
      return !1;
    a = !0, f = !1;
  }
  if (d && !f)
    return i || (i = new _t()), a || Xp(e) ? d1(e, t, n, r, o, i) : Bw(e, t, c, n, r, o, i);
  if (!(n & Hw)) {
    var b = f && tu.call(e, "__wrapped__"), h = u && tu.call(t, "__wrapped__");
    if (b || h) {
      var g = b ? e.value() : e, T = h ? t.value() : t;
      return i || (i = new _t()), o(g, T, n, r, i);
    }
  }
  return d ? (i || (i = new _t()), qw(e, t, n, r, o, i)) : !1;
}
function p1(e, t, n, r, o) {
  return e === t ? !0 : e == null || t == null || !St(e) && !St(t) ? e !== e && t !== t : $w(e, t, n, r, p1, o);
}
var bi = function() {
  return et.Date.now();
}, Kw = "Expected a function", Gw = Math.max, Vw = Math.min;
function Yw(e, t, n) {
  var r, o, i, a, s, c, l = 0, f = !1, u = !1, d = !0;
  if (typeof e != "function")
    throw new TypeError(Kw);
  t = Rl(t) || 0, Kt(n) && (f = !!n.leading, u = "maxWait" in n, i = u ? Gw(Rl(n.maxWait) || 0, t) : i, d = "trailing" in n ? !!n.trailing : d);
  function b(E) {
    var I = r, k = o;
    return r = o = void 0, l = E, a = e.apply(k, I), a;
  }
  function h(E) {
    return l = E, s = setTimeout(m, t), f ? b(E) : a;
  }
  function g(E) {
    var I = E - c, k = E - l, M = t - I;
    return u ? Vw(M, i - k) : M;
  }
  function T(E) {
    var I = E - c, k = E - l;
    return c === void 0 || I >= t || I < 0 || u && k >= i;
  }
  function m() {
    var E = bi();
    if (T(E))
      return y(E);
    s = setTimeout(m, g(E));
  }
  function y(E) {
    return s = void 0, d && r ? b(E) : (r = o = void 0, a);
  }
  function S() {
    s !== void 0 && clearTimeout(s), l = 0, r = c = o = s = void 0;
  }
  function v() {
    return s === void 0 ? a : y(bi());
  }
  function _() {
    var E = bi(), I = T(E);
    if (r = arguments, o = this, c = E, I) {
      if (s === void 0)
        return h(c);
      if (u)
        return clearTimeout(s), s = setTimeout(m, t), b(c);
    }
    return s === void 0 && (s = setTimeout(m, t)), a;
  }
  return _.cancel = S, _.flush = v, _;
}
function Ww(e) {
  var t = e == null ? 0 : e.length;
  return t ? e[t - 1] : void 0;
}
function Zw(e, t) {
  return t.length < 2 ? e : Nb(e, Gb(t, 0, -1));
}
function Jw(e, t) {
  return p1(e, t);
}
var Xw = Object.prototype, Qw = Xw.hasOwnProperty;
function e7(e, t) {
  t = jc(t, e);
  var n = -1, r = t.length;
  if (!r)
    return !0;
  for (var o = e == null || typeof e != "object" && typeof e != "function"; ++n < r; ) {
    var i = t[n];
    if (typeof i == "string") {
      if (i === "__proto__" && !Qw.call(e, "__proto__"))
        return !1;
      if (i === "constructor" && n + 1 < r && typeof t[n + 1] == "string" && t[n + 1] === "prototype") {
        if (o && n === 0)
          continue;
        return !1;
      }
    }
  }
  var a = Zw(e, t);
  return a == null || delete a[t1(Ww(t))];
}
function t7(e) {
  return Kb(e) ? void 0 : e;
}
var n7 = 1, r7 = 2, o7 = 4, i7 = Db(function(e, t) {
  var n = {};
  if (e == null)
    return n;
  var r = !1;
  t = Lp(t, function(i) {
    return i = jc(i, e), r || (r = i.length > 1), i;
  }), a2(e, c1(e), n), r && (n = io(n, n7 | r7 | o7, t7));
  for (var o = t.length; o--; )
    e7(n, t[o]);
  return n;
}), a7 = "Expected a function";
function s7(e, t, n) {
  var r = !0, o = !0;
  if (typeof e != "function")
    throw new TypeError(a7);
  return Kt(n) && (r = "leading" in n ? !!n.leading : r, o = "trailing" in n ? !!n.trailing : o), Yw(e, t, {
    leading: r,
    maxWait: t,
    trailing: o
  });
}
const c7 = "_seekBar_16dv7_14", l7 = {
  seekBar: c7
};
function u7({ value: e = 0, className: t, ...n }) {
  const { translate: r } = Pe(), [o, i] = Se(e), a = at(() => s7(i, 10), []);
  return on(() => {
    a(e);
  }, [e, a]), /* @__PURE__ */ p.createElement(
    "input",
    {
      type: "range",
      className: _e(l7.seekBar, t),
      onMouseDown: (s) => s.stopPropagation(),
      min: 0,
      max: 100,
      value: o,
      step: 1,
      style: { "--fillTo": o / 100 },
      "aria-label": r("a11y|seek_bar_label"),
      ...n
    }
  );
}
function k8({ vm: e }) {
  const { translate: t } = Pe(), {
    playbackState: n,
    mediaName: r = t("timeline|m.audio|unnamed_audio"),
    sizeBytes: o,
    durationSeconds: i,
    playedSeconds: a,
    percentComplete: s,
    error: c
  } = ve(e), l = o ? `(${sm(o)})` : null, f = n === "decoding";
  return /* @__PURE__ */ p.createElement(p.Fragment, null, /* @__PURE__ */ p.createElement(
    $h,
    {
      className: _n.audioPlayer,
      tabIndex: 0,
      onKeyDown: e.onKeyDown,
      "aria-label": t("timeline|m.audio|audio_player"),
      role: "region"
    },
    /* @__PURE__ */ p.createElement(re, { gap: "var(--cpd-space-2x)", align: "center" }, /* @__PURE__ */ p.createElement(
      am,
      {
        tabIndex: -1,
        disabled: f,
        playing: n === "playing",
        togglePlay: e.togglePlay
      }
    ), /* @__PURE__ */ p.createElement(re, { direction: "column", className: _n.mediaInfo }, /* @__PURE__ */ p.createElement("span", { className: _n.mediaName, "data-testid": "audio-player-name" }, r), /* @__PURE__ */ p.createElement(re, { className: _n.byline, gap: "var(--cpd-space-1-5x)" }, /* @__PURE__ */ p.createElement(Il, { seconds: i }), l))),
    /* @__PURE__ */ p.createElement(re, { align: "center", gap: "var(--cpd-space-1x)", "data-testid": "audio-player-seek" }, /* @__PURE__ */ p.createElement(u7, { tabIndex: -1, disabled: f, value: s, onChange: e.onSeekbarChange }), /* @__PURE__ */ p.createElement(Il, { className: _n.clock, seconds: a, role: "timer" }))
  ), c && /* @__PURE__ */ p.createElement("span", { className: _n.error }, t("timeline|m.audio|error_downloading_audio")));
}
const f7 = "_avatarWithDetails_7ga8t_8", d7 = "_title_7ga8t_17", p7 = "_details_7ga8t_28", _i = {
  avatarWithDetails: f7,
  title: d7,
  details: p7
};
function R8({
  as: e,
  className: t,
  details: n,
  avatar: r,
  title: o,
  ...i
}) {
  const a = e || "div";
  return /* @__PURE__ */ p.createElement(a, { className: _e(_i.avatarWithDetails, t), ...i }, r, /* @__PURE__ */ p.createElement(re, { direction: "column" }, /* @__PURE__ */ p.createElement("span", { className: _i.title }, o), /* @__PURE__ */ p.createElement("span", { className: _i.details }, n)));
}
function h1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m10.6 13.8-2.15-2.15a.95.95 0 0 0-.7-.275.95.95 0 0 0-.7.275.95.95 0 0 0-.275.7q0 .425.275.7L9.9 15.9q.3.3.7.3t.7-.3l5.65-5.65a.95.95 0 0 0 .275-.7.95.95 0 0 0-.275-.7.95.95 0 0 0-.7-.275.95.95 0 0 0-.7.275zM12 22a9.7 9.7 0 0 1-3.9-.788 10.1 10.1 0 0 1-3.175-2.137q-1.35-1.35-2.137-3.175A9.7 9.7 0 0 1 2 12q0-2.075.788-3.9a10.1 10.1 0 0 1 2.137-3.175q1.35-1.35 3.175-2.137A9.7 9.7 0 0 1 12 2q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 22 12a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 12 22m0-2q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4 6.325 6.325 4 12t2.325 5.675T12 20"
    })
  });
}
h1.displayName = "CheckCircleIcon";
const h7 = U(h1);
function m1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 17q.424 0 .713-.288A.97.97 0 0 0 13 16a.97.97 0 0 0-.287-.713A.97.97 0 0 0 12 15a.97.97 0 0 0-.713.287A.97.97 0 0 0 11 16q0 .424.287.712.288.288.713.288m0-4q.424 0 .713-.287A.97.97 0 0 0 13 12V8a.97.97 0 0 0-.287-.713A.97.97 0 0 0 12 7a.97.97 0 0 0-.713.287A.97.97 0 0 0 11 8v4q0 .424.287.713.288.287.713.287m0 9a9.7 9.7 0 0 1-3.9-.788 10.1 10.1 0 0 1-3.175-2.137q-1.35-1.35-2.137-3.175A9.7 9.7 0 0 1 2 12q0-2.075.788-3.9a10.1 10.1 0 0 1 2.137-3.175q1.35-1.35 3.175-2.137A9.7 9.7 0 0 1 12 2q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 22 12a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 12 22"
    })
  });
}
m1.displayName = "ErrorSolidIcon";
const g1 = U(m1);
function y1(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M11.288 7.288A.97.97 0 0 1 12 7q.424 0 .713.287Q13 7.576 13 8t-.287.713A.97.97 0 0 1 12 9a.97.97 0 0 1-.713-.287A.97.97 0 0 1 11 8q0-.424.287-.713m.001 4.001A.97.97 0 0 1 12 11q.424 0 .713.287.287.288.287.713v4q0 .424-.287.712A.97.97 0 0 1 12 17a.97.97 0 0 1-.713-.288A.97.97 0 0 1 11 16v-4q0-.424.287-.713"
    }), /* @__PURE__ */ R.jsx("path", {
      fillRule: "evenodd",
      d: "M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10m-2 0a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
      clipRule: "evenodd"
    })]
  });
}
y1.displayName = "InfoIcon";
const nu = U(y1), m7 = "_banner_48r66_20", g7 = "_content_48r66_51", y7 = "_icon_48r66_63", v7 = "_actions_48r66_83", Yr = {
  banner: m7,
  content: g7,
  icon: y7,
  actions: v7
};
function b7(e) {
  return e.toLowerCase().replace("_", "-");
}
function v1(e) {
  const t = [], n = b7(e), r = n.split("-");
  return r.length === 2 && r[0] === r[1] ? t.push(r[0]) : (t.push(n), r.length === 2 && t.push(r[0])), t;
}
const _7 = "|";
var wi, ru;
function w7() {
  if (ru) return wi;
  ru = 1;
  var e = Object.prototype.hasOwnProperty, t = Object.prototype.toString, n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, o = function(l) {
    return typeof Array.isArray == "function" ? Array.isArray(l) : t.call(l) === "[object Array]";
  }, i = function(l) {
    if (!l || t.call(l) !== "[object Object]")
      return !1;
    var f = e.call(l, "constructor"), u = l.constructor && l.constructor.prototype && e.call(l.constructor.prototype, "isPrototypeOf");
    if (l.constructor && !f && !u)
      return !1;
    var d;
    for (d in l)
      ;
    return typeof d > "u" || e.call(l, d);
  }, a = function(l, f) {
    n && f.name === "__proto__" ? n(l, f.name, {
      enumerable: !0,
      configurable: !0,
      value: f.newValue,
      writable: !0
    }) : l[f.name] = f.newValue;
  }, s = function(l, f) {
    if (f === "__proto__")
      if (e.call(l, f)) {
        if (r)
          return r(l, f).value;
      } else return;
    return l[f];
  };
  return wi = function c() {
    var l, f, u, d, b, h, g = arguments[0], T = 1, m = arguments.length, y = !1;
    for (typeof g == "boolean" && (y = g, g = arguments[1] || {}, T = 2), (g == null || typeof g != "object" && typeof g != "function") && (g = {}); T < m; ++T)
      if (l = arguments[T], l != null)
        for (f in l)
          u = s(g, f), d = s(l, f), g !== d && (y && d && (i(d) || (b = o(d))) ? (b ? (b = !1, h = u && o(u) ? u : []) : h = u && i(u) ? u : {}, a(g, { name: f, newValue: c(y, h, d) })) : typeof d < "u" && a(g, { name: f, newValue: d }));
    return g;
  }, wi;
}
var Ei = {}, Si = {}, Ti, ou;
function b1() {
  return ou || (ou = 1, Ti = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function")
      return !1;
    if (typeof Symbol.iterator == "symbol")
      return !0;
    var t = {}, n = /* @__PURE__ */ Symbol("test"), r = Object(n);
    if (typeof n == "string" || Object.prototype.toString.call(n) !== "[object Symbol]" || Object.prototype.toString.call(r) !== "[object Symbol]")
      return !1;
    var o = 42;
    t[n] = o;
    for (var i in t)
      return !1;
    if (typeof Object.keys == "function" && Object.keys(t).length !== 0 || typeof Object.getOwnPropertyNames == "function" && Object.getOwnPropertyNames(t).length !== 0)
      return !1;
    var a = Object.getOwnPropertySymbols(t);
    if (a.length !== 1 || a[0] !== n || !Object.prototype.propertyIsEnumerable.call(t, n))
      return !1;
    if (typeof Object.getOwnPropertyDescriptor == "function") {
      var s = (
        /** @type {PropertyDescriptor} */
        Object.getOwnPropertyDescriptor(t, n)
      );
      if (s.value !== o || s.enumerable !== !0)
        return !1;
    }
    return !0;
  }), Ti;
}
var Ai, iu;
function ri() {
  if (iu) return Ai;
  iu = 1;
  var e = b1();
  return Ai = function() {
    return e() && !!Symbol.toStringTag;
  }, Ai;
}
var Ii, au;
function _1() {
  return au || (au = 1, Ii = Object), Ii;
}
var Oi, su;
function E7() {
  return su || (su = 1, Oi = Error), Oi;
}
var ji, cu;
function S7() {
  return cu || (cu = 1, ji = EvalError), ji;
}
var Pi, lu;
function T7() {
  return lu || (lu = 1, Pi = RangeError), Pi;
}
var ki, uu;
function A7() {
  return uu || (uu = 1, ki = ReferenceError), ki;
}
var Ri, fu;
function w1() {
  return fu || (fu = 1, Ri = SyntaxError), Ri;
}
var Mi, du;
function zr() {
  return du || (du = 1, Mi = TypeError), Mi;
}
var Ci, pu;
function I7() {
  return pu || (pu = 1, Ci = URIError), Ci;
}
var xi, hu;
function O7() {
  return hu || (hu = 1, xi = Math.abs), xi;
}
var Ni, mu;
function j7() {
  return mu || (mu = 1, Ni = Math.floor), Ni;
}
var zi, gu;
function P7() {
  return gu || (gu = 1, zi = Math.max), zi;
}
var Bi, yu;
function k7() {
  return yu || (yu = 1, Bi = Math.min), Bi;
}
var Fi, vu;
function R7() {
  return vu || (vu = 1, Fi = Math.pow), Fi;
}
var Di, bu;
function M7() {
  return bu || (bu = 1, Di = Math.round), Di;
}
var Li, _u;
function C7() {
  return _u || (_u = 1, Li = Number.isNaN || function(t) {
    return t !== t;
  }), Li;
}
var qi, wu;
function x7() {
  if (wu) return qi;
  wu = 1;
  var e = /* @__PURE__ */ C7();
  return qi = function(n) {
    return e(n) || n === 0 ? n : n < 0 ? -1 : 1;
  }, qi;
}
var Hi, Eu;
function N7() {
  return Eu || (Eu = 1, Hi = Object.getOwnPropertyDescriptor), Hi;
}
var Ui, Su;
function Wn() {
  if (Su) return Ui;
  Su = 1;
  var e = /* @__PURE__ */ N7();
  if (e)
    try {
      e([], "length");
    } catch {
      e = null;
    }
  return Ui = e, Ui;
}
var $i, Tu;
function oi() {
  if (Tu) return $i;
  Tu = 1;
  var e = Object.defineProperty || !1;
  if (e)
    try {
      e({}, "a", { value: 1 });
    } catch {
      e = !1;
    }
  return $i = e, $i;
}
var Ki, Au;
function z7() {
  if (Au) return Ki;
  Au = 1;
  var e = typeof Symbol < "u" && Symbol, t = b1();
  return Ki = function() {
    return typeof e != "function" || typeof Symbol != "function" || typeof e("foo") != "symbol" || typeof /* @__PURE__ */ Symbol("bar") != "symbol" ? !1 : t();
  }, Ki;
}
var Gi, Iu;
function E1() {
  return Iu || (Iu = 1, Gi = typeof Reflect < "u" && Reflect.getPrototypeOf || null), Gi;
}
var Vi, Ou;
function S1() {
  if (Ou) return Vi;
  Ou = 1;
  var e = /* @__PURE__ */ _1();
  return Vi = e.getPrototypeOf || null, Vi;
}
var Yi, ju;
function B7() {
  if (ju) return Yi;
  ju = 1;
  var e = "Function.prototype.bind called on incompatible ", t = Object.prototype.toString, n = Math.max, r = "[object Function]", o = function(c, l) {
    for (var f = [], u = 0; u < c.length; u += 1)
      f[u] = c[u];
    for (var d = 0; d < l.length; d += 1)
      f[d + c.length] = l[d];
    return f;
  }, i = function(c, l) {
    for (var f = [], u = l, d = 0; u < c.length; u += 1, d += 1)
      f[d] = c[u];
    return f;
  }, a = function(s, c) {
    for (var l = "", f = 0; f < s.length; f += 1)
      l += s[f], f + 1 < s.length && (l += c);
    return l;
  };
  return Yi = function(c) {
    var l = this;
    if (typeof l != "function" || t.apply(l) !== r)
      throw new TypeError(e + l);
    for (var f = i(arguments, 1), u, d = function() {
      if (this instanceof u) {
        var m = l.apply(
          this,
          o(f, arguments)
        );
        return Object(m) === m ? m : this;
      }
      return l.apply(
        c,
        o(f, arguments)
      );
    }, b = n(0, l.length - f.length), h = [], g = 0; g < b; g++)
      h[g] = "$" + g;
    if (u = Function("binder", "return function (" + a(h, ",") + "){ return binder.apply(this,arguments); }")(d), l.prototype) {
      var T = function() {
      };
      T.prototype = l.prototype, u.prototype = new T(), T.prototype = null;
    }
    return u;
  }, Yi;
}
var Wi, Pu;
function Br() {
  if (Pu) return Wi;
  Pu = 1;
  var e = B7();
  return Wi = Function.prototype.bind || e, Wi;
}
var Zi, ku;
function Rc() {
  return ku || (ku = 1, Zi = Function.prototype.call), Zi;
}
var Ji, Ru;
function Mc() {
  return Ru || (Ru = 1, Ji = Function.prototype.apply), Ji;
}
var Xi, Mu;
function F7() {
  return Mu || (Mu = 1, Xi = typeof Reflect < "u" && Reflect && Reflect.apply), Xi;
}
var Qi, Cu;
function T1() {
  if (Cu) return Qi;
  Cu = 1;
  var e = Br(), t = Mc(), n = Rc(), r = F7();
  return Qi = r || e.call(n, t), Qi;
}
var ea, xu;
function Cc() {
  if (xu) return ea;
  xu = 1;
  var e = Br(), t = /* @__PURE__ */ zr(), n = Rc(), r = T1();
  return ea = function(i) {
    if (i.length < 1 || typeof i[0] != "function")
      throw new t("a function is required");
    return r(e, n, i);
  }, ea;
}
var ta, Nu;
function D7() {
  if (Nu) return ta;
  Nu = 1;
  var e = Cc(), t = /* @__PURE__ */ Wn(), n;
  try {
    n = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (a) {
    if (!a || typeof a != "object" || !("code" in a) || a.code !== "ERR_PROTO_ACCESS")
      throw a;
  }
  var r = !!n && t && t(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  ), o = Object, i = o.getPrototypeOf;
  return ta = r && typeof r.get == "function" ? e([r.get]) : typeof i == "function" ? (
    /** @type {import('./get')} */
    function(s) {
      return i(s == null ? s : o(s));
    }
  ) : !1, ta;
}
var na, zu;
function xc() {
  if (zu) return na;
  zu = 1;
  var e = E1(), t = S1(), n = /* @__PURE__ */ D7();
  return na = e ? function(o) {
    return e(o);
  } : t ? function(o) {
    if (!o || typeof o != "object" && typeof o != "function")
      throw new TypeError("getProto: not an object");
    return t(o);
  } : n ? function(o) {
    return n(o);
  } : null, na;
}
var ra, Bu;
function A1() {
  if (Bu) return ra;
  Bu = 1;
  var e = Function.prototype.call, t = Object.prototype.hasOwnProperty, n = Br();
  return ra = n.call(e, t), ra;
}
var oa, Fu;
function I1() {
  if (Fu) return oa;
  Fu = 1;
  var e, t = /* @__PURE__ */ _1(), n = /* @__PURE__ */ E7(), r = /* @__PURE__ */ S7(), o = /* @__PURE__ */ T7(), i = /* @__PURE__ */ A7(), a = /* @__PURE__ */ w1(), s = /* @__PURE__ */ zr(), c = /* @__PURE__ */ I7(), l = /* @__PURE__ */ O7(), f = /* @__PURE__ */ j7(), u = /* @__PURE__ */ P7(), d = /* @__PURE__ */ k7(), b = /* @__PURE__ */ R7(), h = /* @__PURE__ */ M7(), g = /* @__PURE__ */ x7(), T = Function, m = function(F) {
    try {
      return T('"use strict"; return (' + F + ").constructor;")();
    } catch {
    }
  }, y = /* @__PURE__ */ Wn(), S = /* @__PURE__ */ oi(), v = function() {
    throw new s();
  }, _ = y ? (function() {
    try {
      return arguments.callee, v;
    } catch {
      try {
        return y(arguments, "callee").get;
      } catch {
        return v;
      }
    }
  })() : v, E = z7()(), I = xc(), k = S1(), M = E1(), x = Mc(), q = Rc(), V = {}, ie = typeof Uint8Array > "u" || !I ? e : I(Uint8Array), ce = {
    __proto__: null,
    "%AggregateError%": typeof AggregateError > "u" ? e : AggregateError,
    "%Array%": Array,
    "%ArrayBuffer%": typeof ArrayBuffer > "u" ? e : ArrayBuffer,
    "%ArrayIteratorPrototype%": E && I ? I([][Symbol.iterator]()) : e,
    "%AsyncFromSyncIteratorPrototype%": e,
    "%AsyncFunction%": V,
    "%AsyncGenerator%": V,
    "%AsyncGeneratorFunction%": V,
    "%AsyncIteratorPrototype%": V,
    "%Atomics%": typeof Atomics > "u" ? e : Atomics,
    "%BigInt%": typeof BigInt > "u" ? e : BigInt,
    "%BigInt64Array%": typeof BigInt64Array > "u" ? e : BigInt64Array,
    "%BigUint64Array%": typeof BigUint64Array > "u" ? e : BigUint64Array,
    "%Boolean%": Boolean,
    "%DataView%": typeof DataView > "u" ? e : DataView,
    "%Date%": Date,
    "%decodeURI%": decodeURI,
    "%decodeURIComponent%": decodeURIComponent,
    "%encodeURI%": encodeURI,
    "%encodeURIComponent%": encodeURIComponent,
    "%Error%": n,
    "%eval%": eval,
    // eslint-disable-line no-eval
    "%EvalError%": r,
    "%Float16Array%": typeof Float16Array > "u" ? e : Float16Array,
    "%Float32Array%": typeof Float32Array > "u" ? e : Float32Array,
    "%Float64Array%": typeof Float64Array > "u" ? e : Float64Array,
    "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? e : FinalizationRegistry,
    "%Function%": T,
    "%GeneratorFunction%": V,
    "%Int8Array%": typeof Int8Array > "u" ? e : Int8Array,
    "%Int16Array%": typeof Int16Array > "u" ? e : Int16Array,
    "%Int32Array%": typeof Int32Array > "u" ? e : Int32Array,
    "%isFinite%": isFinite,
    "%isNaN%": isNaN,
    "%IteratorPrototype%": E && I ? I(I([][Symbol.iterator]())) : e,
    "%JSON%": typeof JSON == "object" ? JSON : e,
    "%Map%": typeof Map > "u" ? e : Map,
    "%MapIteratorPrototype%": typeof Map > "u" || !E || !I ? e : I((/* @__PURE__ */ new Map())[Symbol.iterator]()),
    "%Math%": Math,
    "%Number%": Number,
    "%Object%": t,
    "%Object.getOwnPropertyDescriptor%": y,
    "%parseFloat%": parseFloat,
    "%parseInt%": parseInt,
    "%Promise%": typeof Promise > "u" ? e : Promise,
    "%Proxy%": typeof Proxy > "u" ? e : Proxy,
    "%RangeError%": o,
    "%ReferenceError%": i,
    "%Reflect%": typeof Reflect > "u" ? e : Reflect,
    "%RegExp%": RegExp,
    "%Set%": typeof Set > "u" ? e : Set,
    "%SetIteratorPrototype%": typeof Set > "u" || !E || !I ? e : I((/* @__PURE__ */ new Set())[Symbol.iterator]()),
    "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? e : SharedArrayBuffer,
    "%String%": String,
    "%StringIteratorPrototype%": E && I ? I(""[Symbol.iterator]()) : e,
    "%Symbol%": E ? Symbol : e,
    "%SyntaxError%": a,
    "%ThrowTypeError%": _,
    "%TypedArray%": ie,
    "%TypeError%": s,
    "%Uint8Array%": typeof Uint8Array > "u" ? e : Uint8Array,
    "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? e : Uint8ClampedArray,
    "%Uint16Array%": typeof Uint16Array > "u" ? e : Uint16Array,
    "%Uint32Array%": typeof Uint32Array > "u" ? e : Uint32Array,
    "%URIError%": c,
    "%WeakMap%": typeof WeakMap > "u" ? e : WeakMap,
    "%WeakRef%": typeof WeakRef > "u" ? e : WeakRef,
    "%WeakSet%": typeof WeakSet > "u" ? e : WeakSet,
    "%Function.prototype.call%": q,
    "%Function.prototype.apply%": x,
    "%Object.defineProperty%": S,
    "%Object.getPrototypeOf%": k,
    "%Math.abs%": l,
    "%Math.floor%": f,
    "%Math.max%": u,
    "%Math.min%": d,
    "%Math.pow%": b,
    "%Math.round%": h,
    "%Math.sign%": g,
    "%Reflect.getPrototypeOf%": M
  };
  if (I)
    try {
      null.error;
    } catch (F) {
      var D = I(I(F));
      ce["%Error.prototype%"] = D;
    }
  var K = function F(N) {
    var Y;
    if (N === "%AsyncFunction%")
      Y = m("async function () {}");
    else if (N === "%GeneratorFunction%")
      Y = m("function* () {}");
    else if (N === "%AsyncGeneratorFunction%")
      Y = m("async function* () {}");
    else if (N === "%AsyncGenerator%") {
      var Z = F("%AsyncGeneratorFunction%");
      Z && (Y = Z.prototype);
    } else if (N === "%AsyncIteratorPrototype%") {
      var ue = F("%AsyncGenerator%");
      ue && I && (Y = I(ue.prototype));
    }
    return ce[N] = Y, Y;
  }, W = {
    __proto__: null,
    "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
    "%ArrayPrototype%": ["Array", "prototype"],
    "%ArrayProto_entries%": ["Array", "prototype", "entries"],
    "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
    "%ArrayProto_keys%": ["Array", "prototype", "keys"],
    "%ArrayProto_values%": ["Array", "prototype", "values"],
    "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
    "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
    "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
    "%BooleanPrototype%": ["Boolean", "prototype"],
    "%DataViewPrototype%": ["DataView", "prototype"],
    "%DatePrototype%": ["Date", "prototype"],
    "%ErrorPrototype%": ["Error", "prototype"],
    "%EvalErrorPrototype%": ["EvalError", "prototype"],
    "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
    "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
    "%FunctionPrototype%": ["Function", "prototype"],
    "%Generator%": ["GeneratorFunction", "prototype"],
    "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
    "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
    "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
    "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
    "%JSONParse%": ["JSON", "parse"],
    "%JSONStringify%": ["JSON", "stringify"],
    "%MapPrototype%": ["Map", "prototype"],
    "%NumberPrototype%": ["Number", "prototype"],
    "%ObjectPrototype%": ["Object", "prototype"],
    "%ObjProto_toString%": ["Object", "prototype", "toString"],
    "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
    "%PromisePrototype%": ["Promise", "prototype"],
    "%PromiseProto_then%": ["Promise", "prototype", "then"],
    "%Promise_all%": ["Promise", "all"],
    "%Promise_reject%": ["Promise", "reject"],
    "%Promise_resolve%": ["Promise", "resolve"],
    "%RangeErrorPrototype%": ["RangeError", "prototype"],
    "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
    "%RegExpPrototype%": ["RegExp", "prototype"],
    "%SetPrototype%": ["Set", "prototype"],
    "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
    "%StringPrototype%": ["String", "prototype"],
    "%SymbolPrototype%": ["Symbol", "prototype"],
    "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
    "%TypedArrayPrototype%": ["TypedArray", "prototype"],
    "%TypeErrorPrototype%": ["TypeError", "prototype"],
    "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
    "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
    "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
    "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
    "%URIErrorPrototype%": ["URIError", "prototype"],
    "%WeakMapPrototype%": ["WeakMap", "prototype"],
    "%WeakSetPrototype%": ["WeakSet", "prototype"]
  }, te = Br(), le = /* @__PURE__ */ A1(), pe = te.call(q, Array.prototype.concat), j = te.call(x, Array.prototype.splice), w = te.call(q, String.prototype.replace), A = te.call(q, String.prototype.slice), O = te.call(q, RegExp.prototype.exec), B = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, $ = /\\(\\)?/g, z = function(N) {
    var Y = A(N, 0, 1), Z = A(N, -1);
    if (Y === "%" && Z !== "%")
      throw new a("invalid intrinsic syntax, expected closing `%`");
    if (Z === "%" && Y !== "%")
      throw new a("invalid intrinsic syntax, expected opening `%`");
    var ue = [];
    return w(N, B, function(he, Ke, me, bn) {
      ue[ue.length] = me ? w(bn, $, "$1") : Ke || he;
    }), ue;
  }, L = function(N, Y) {
    var Z = N, ue;
    if (le(W, Z) && (ue = W[Z], Z = "%" + ue[0] + "%"), le(ce, Z)) {
      var he = ce[Z];
      if (he === V && (he = K(Z)), typeof he > "u" && !Y)
        throw new s("intrinsic " + N + " exists, but is not available. Please file an issue!");
      return {
        alias: ue,
        name: Z,
        value: he
      };
    }
    throw new a("intrinsic " + N + " does not exist!");
  };
  return oa = function(N, Y) {
    if (typeof N != "string" || N.length === 0)
      throw new s("intrinsic name must be a non-empty string");
    if (arguments.length > 1 && typeof Y != "boolean")
      throw new s('"allowMissing" argument must be a boolean');
    if (O(/^%?[^%]*%?$/, N) === null)
      throw new a("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
    var Z = z(N), ue = Z.length > 0 ? Z[0] : "", he = L("%" + ue + "%", Y), Ke = he.name, me = he.value, bn = !1, Zn = he.alias;
    Zn && (ue = Zn[0], j(Z, pe([0, 1], Zn)));
    for (var P = 1, nn = !0; P < Z.length; P += 1) {
      var tt = Z[P], Dr = A(tt, 0, 1), Lr = A(tt, -1);
      if ((Dr === '"' || Dr === "'" || Dr === "`" || Lr === '"' || Lr === "'" || Lr === "`") && Dr !== Lr)
        throw new a("property names with quotes must have matching quotes");
      if ((tt === "constructor" || !nn) && (bn = !0), ue += "." + tt, Ke = "%" + ue + "%", le(ce, Ke))
        me = ce[Ke];
      else if (me != null) {
        if (!(tt in me)) {
          if (!Y)
            throw new s("base intrinsic for " + N + " exists, but the property is not available.");
          return;
        }
        if (y && P + 1 >= Z.length) {
          var qr = y(me, tt);
          nn = !!qr, nn && "get" in qr && !("originalValue" in qr.get) ? me = qr.get : me = me[tt];
        } else
          nn = le(me, tt), me = me[tt];
        nn && !bn && (ce[Ke] = me);
      }
    }
    return me;
  }, oa;
}
var ia, Du;
function Fr() {
  if (Du) return ia;
  Du = 1;
  var e = /* @__PURE__ */ I1(), t = Cc(), n = t([e("%String.prototype.indexOf%")]);
  return ia = function(o, i) {
    var a = (
      /** @type {(this: unknown, ...args: unknown[]) => unknown} */
      e(o, !!i)
    );
    return typeof a == "function" && n(o, ".prototype.") > -1 ? t(
      /** @type {const} */
      [a]
    ) : a;
  }, ia;
}
var aa, Lu;
function L7() {
  if (Lu) return aa;
  Lu = 1;
  var e = ri()(), t = /* @__PURE__ */ Fr(), n = t("Object.prototype.toString"), r = function(s) {
    return e && s && typeof s == "object" && Symbol.toStringTag in s ? !1 : n(s) === "[object Arguments]";
  }, o = function(s) {
    return r(s) ? !0 : s !== null && typeof s == "object" && "length" in s && typeof s.length == "number" && s.length >= 0 && n(s) !== "[object Array]" && "callee" in s && n(s.callee) === "[object Function]";
  }, i = (function() {
    return r(arguments);
  })();
  return r.isLegacyArguments = o, aa = i ? r : o, aa;
}
var sa, qu;
function q7() {
  if (qu) return sa;
  qu = 1;
  var e = /* @__PURE__ */ Fr(), t = ri()(), n = /* @__PURE__ */ A1(), r = /* @__PURE__ */ Wn(), o;
  if (t) {
    var i = e("RegExp.prototype.exec"), a = {}, s = function() {
      throw a;
    }, c = {
      toString: s,
      valueOf: s
    };
    typeof Symbol.toPrimitive == "symbol" && (c[Symbol.toPrimitive] = s), o = function(d) {
      if (!d || typeof d != "object")
        return !1;
      var b = (
        /** @type {NonNullable<typeof gOPD>} */
        r(
          /** @type {{ lastIndex?: unknown }} */
          d,
          "lastIndex"
        )
      ), h = b && n(b, "value");
      if (!h)
        return !1;
      try {
        i(
          d,
          /** @type {string} */
          /** @type {unknown} */
          c
        );
      } catch (g) {
        return g === a;
      }
    };
  } else {
    var l = e("Object.prototype.toString"), f = "[object RegExp]";
    o = function(d) {
      return !d || typeof d != "object" && typeof d != "function" ? !1 : l(d) === f;
    };
  }
  return sa = o, sa;
}
var ca, Hu;
function H7() {
  if (Hu) return ca;
  Hu = 1;
  var e = /* @__PURE__ */ Fr(), t = q7(), n = e("RegExp.prototype.exec"), r = /* @__PURE__ */ zr();
  return ca = function(i) {
    if (!t(i))
      throw new r("`regex` must be a RegExp");
    return function(s) {
      return n(i, s) !== null;
    };
  }, ca;
}
var la, Uu;
function U7() {
  if (Uu) return la;
  Uu = 1;
  const e = (
    /** @type {GeneratorFunctionConstructor} */
    (function* () {
    }).constructor
  );
  return la = () => e, la;
}
var ua, $u;
function $7() {
  if ($u) return ua;
  $u = 1;
  var e = /* @__PURE__ */ Fr(), t = /* @__PURE__ */ H7(), n = t(/^\s*(?:function)?\*/), r = ri()(), o = xc(), i = e("Object.prototype.toString"), a = e("Function.prototype.toString"), s = /* @__PURE__ */ U7();
  return ua = function(l) {
    if (typeof l != "function")
      return !1;
    if (n(a(l)))
      return !0;
    if (!r) {
      var f = i(l);
      return f === "[object GeneratorFunction]";
    }
    if (!o)
      return !1;
    var u = s();
    return u && o(l) === u.prototype;
  }, ua;
}
var fa, Ku;
function K7() {
  if (Ku) return fa;
  Ku = 1;
  var e = Function.prototype.toString, t = typeof Reflect == "object" && Reflect !== null && Reflect.apply, n, r;
  if (typeof t == "function" && typeof Object.defineProperty == "function")
    try {
      n = Object.defineProperty({}, "length", {
        get: function() {
          throw r;
        }
      }), r = {}, t(function() {
        throw 42;
      }, null, n);
    } catch (y) {
      y !== r && (t = null);
    }
  else
    t = null;
  var o = /^\s*class\b/, i = function(S) {
    try {
      var v = e.call(S);
      return o.test(v);
    } catch {
      return !1;
    }
  }, a = function(S) {
    try {
      return i(S) ? !1 : (e.call(S), !0);
    } catch {
      return !1;
    }
  }, s = Object.prototype.toString, c = "[object Object]", l = "[object Function]", f = "[object GeneratorFunction]", u = "[object HTMLAllCollection]", d = "[object HTML document.all class]", b = "[object HTMLCollection]", h = typeof Symbol == "function" && !!Symbol.toStringTag, g = !(0 in [,]), T = function() {
    return !1;
  };
  if (typeof document == "object") {
    var m = document.all;
    s.call(m) === s.call(document.all) && (T = function(S) {
      if ((g || !S) && (typeof S > "u" || typeof S == "object"))
        try {
          var v = s.call(S);
          return (v === u || v === d || v === b || v === c) && S("") == null;
        } catch {
        }
      return !1;
    });
  }
  return fa = t ? function(S) {
    if (T(S))
      return !0;
    if (!S || typeof S != "function" && typeof S != "object")
      return !1;
    try {
      t(S, null, n);
    } catch (v) {
      if (v !== r)
        return !1;
    }
    return !i(S) && a(S);
  } : function(S) {
    if (T(S))
      return !0;
    if (!S || typeof S != "function" && typeof S != "object")
      return !1;
    if (h)
      return a(S);
    if (i(S))
      return !1;
    var v = s.call(S);
    return v !== l && v !== f && !/^\[object HTML/.test(v) ? !1 : a(S);
  }, fa;
}
var da, Gu;
function G7() {
  if (Gu) return da;
  Gu = 1;
  var e = K7(), t = Object.prototype.toString, n = Object.prototype.hasOwnProperty, r = function(c, l, f) {
    for (var u = 0, d = c.length; u < d; u++)
      n.call(c, u) && (f == null ? l(c[u], u, c) : l.call(f, c[u], u, c));
  }, o = function(c, l, f) {
    for (var u = 0, d = c.length; u < d; u++)
      f == null ? l(c.charAt(u), u, c) : l.call(f, c.charAt(u), u, c);
  }, i = function(c, l, f) {
    for (var u in c)
      n.call(c, u) && (f == null ? l(c[u], u, c) : l.call(f, c[u], u, c));
  };
  function a(s) {
    return t.call(s) === "[object Array]";
  }
  return da = function(c, l, f) {
    if (!e(l))
      throw new TypeError("iterator must be a function");
    var u;
    arguments.length >= 3 && (u = f), a(c) ? r(c, l, u) : typeof c == "string" ? o(c, l, u) : i(c, l, u);
  }, da;
}
var pa, Vu;
function V7() {
  return Vu || (Vu = 1, pa = [
    "Float16Array",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "BigInt64Array",
    "BigUint64Array"
  ]), pa;
}
var ha, Yu;
function Y7() {
  if (Yu) return ha;
  Yu = 1;
  var e = /* @__PURE__ */ V7(), t = typeof globalThis > "u" ? Cf : globalThis;
  return ha = function() {
    for (var r = [], o = 0; o < e.length; o++)
      typeof t[e[o]] == "function" && (r[r.length] = e[o]);
    return r;
  }, ha;
}
var ma = { exports: {} }, ga, Wu;
function W7() {
  if (Wu) return ga;
  Wu = 1;
  var e = /* @__PURE__ */ oi(), t = /* @__PURE__ */ w1(), n = /* @__PURE__ */ zr(), r = /* @__PURE__ */ Wn();
  return ga = function(i, a, s) {
    if (!i || typeof i != "object" && typeof i != "function")
      throw new n("`obj` must be an object or a function`");
    if (typeof a != "string" && typeof a != "symbol")
      throw new n("`property` must be a string or a symbol`");
    if (arguments.length > 3 && typeof arguments[3] != "boolean" && arguments[3] !== null)
      throw new n("`nonEnumerable`, if provided, must be a boolean or null");
    if (arguments.length > 4 && typeof arguments[4] != "boolean" && arguments[4] !== null)
      throw new n("`nonWritable`, if provided, must be a boolean or null");
    if (arguments.length > 5 && typeof arguments[5] != "boolean" && arguments[5] !== null)
      throw new n("`nonConfigurable`, if provided, must be a boolean or null");
    if (arguments.length > 6 && typeof arguments[6] != "boolean")
      throw new n("`loose`, if provided, must be a boolean");
    var c = arguments.length > 3 ? arguments[3] : null, l = arguments.length > 4 ? arguments[4] : null, f = arguments.length > 5 ? arguments[5] : null, u = arguments.length > 6 ? arguments[6] : !1, d = !!r && r(i, a);
    if (e)
      e(i, a, {
        configurable: f === null && d ? d.configurable : !f,
        enumerable: c === null && d ? d.enumerable : !c,
        value: s,
        writable: l === null && d ? d.writable : !l
      });
    else if (u || !c && !l && !f)
      i[a] = s;
    else
      throw new t("This environment does not support defining a property as non-configurable, non-writable, or non-enumerable.");
  }, ga;
}
var ya, Zu;
function Z7() {
  if (Zu) return ya;
  Zu = 1;
  var e = /* @__PURE__ */ oi(), t = function() {
    return !!e;
  };
  return t.hasArrayLengthDefineBug = function() {
    if (!e)
      return null;
    try {
      return e([], "length", { value: 1 }).length !== 1;
    } catch {
      return !0;
    }
  }, ya = t, ya;
}
var va, Ju;
function J7() {
  if (Ju) return va;
  Ju = 1;
  var e = /* @__PURE__ */ I1(), t = /* @__PURE__ */ W7(), n = /* @__PURE__ */ Z7()(), r = /* @__PURE__ */ Wn(), o = /* @__PURE__ */ zr(), i = e("%Math.floor%");
  return va = function(s, c) {
    if (typeof s != "function")
      throw new o("`fn` is not a function");
    if (typeof c != "number" || c < 0 || c > 4294967295 || i(c) !== c)
      throw new o("`length` must be a positive 32-bit integer");
    var l = arguments.length > 2 && !!arguments[2], f = !0, u = !0;
    if ("length" in s && r) {
      var d = r(s, "length");
      d && !d.configurable && (f = !1), d && !d.writable && (u = !1);
    }
    return (f || u || !l) && (n ? t(
      /** @type {Parameters<define>[0]} */
      s,
      "length",
      c,
      !0,
      !0
    ) : t(
      /** @type {Parameters<define>[0]} */
      s,
      "length",
      c
    )), s;
  }, va;
}
var ba, Xu;
function X7() {
  if (Xu) return ba;
  Xu = 1;
  var e = Br(), t = Mc(), n = T1();
  return ba = function() {
    return n(e, t, arguments);
  }, ba;
}
var Qu;
function Q7() {
  return Qu || (Qu = 1, (function(e) {
    var t = /* @__PURE__ */ J7(), n = /* @__PURE__ */ oi(), r = Cc(), o = X7();
    e.exports = function(a) {
      var s = r(arguments), c = a.length - (arguments.length - 1);
      return t(
        s,
        1 + (c > 0 ? c : 0),
        !0
      );
    }, n ? n(e.exports, "apply", { value: o }) : e.exports.apply = o;
  })(ma)), ma.exports;
}
var _a, ef;
function O1() {
  if (ef) return _a;
  ef = 1;
  var e = G7(), t = /* @__PURE__ */ Y7(), n = Q7(), r = /* @__PURE__ */ Fr(), o = /* @__PURE__ */ Wn(), i = xc(), a = r("Object.prototype.toString"), s = ri()(), c = typeof globalThis > "u" ? Cf : globalThis, l = t(), f = r("String.prototype.slice"), u = r("Array.prototype.indexOf", !0) || function(T, m) {
    for (var y = 0; y < T.length; y += 1)
      if (T[y] === m)
        return y;
    return -1;
  }, d = { __proto__: null };
  s && o && i ? e(l, function(g) {
    var T = new c[g]();
    if (Symbol.toStringTag in T && i) {
      var m = i(T), y = o(m, Symbol.toStringTag);
      if (!y && m) {
        var S = i(m);
        y = o(S, Symbol.toStringTag);
      }
      d["$" + g] = n(y.get);
    }
  }) : e(l, function(g) {
    var T = new c[g](), m = T.slice || T.set;
    m && (d[
      /** @type {`$${import('.').TypedArrayName}`} */
      "$" + g
    ] = /** @type {import('./types').BoundSlice | import('./types').BoundSet} */
    // @ts-expect-error TODO FIXME
    n(m));
  });
  var b = function(T) {
    var m = !1;
    return e(
      /** @type {Record<`\$${import('.').TypedArrayName}`, Getter>} */
      d,
      /** @type {(getter: Getter, name: `\$${import('.').TypedArrayName}`) => void} */
      function(y, S) {
        if (!m)
          try {
            "$" + y(T) === S && (m = /** @type {import('.').TypedArrayName} */
            f(S, 1));
          } catch {
          }
      }
    ), m;
  }, h = function(T) {
    var m = !1;
    return e(
      /** @type {Record<`\$${import('.').TypedArrayName}`, Getter>} */
      d,
      /** @type {(getter: Getter, name: `\$${import('.').TypedArrayName}`) => void} */
      function(y, S) {
        if (!m)
          try {
            y(T), m = /** @type {import('.').TypedArrayName} */
            f(S, 1);
          } catch {
          }
      }
    ), m;
  };
  return _a = function(T) {
    if (!T || typeof T != "object")
      return !1;
    if (!s) {
      var m = f(a(T), 8, -1);
      return u(l, m) > -1 ? m : m !== "Object" ? !1 : h(T);
    }
    return o ? b(T) : null;
  }, _a;
}
var wa, tf;
function e3() {
  if (tf) return wa;
  tf = 1;
  var e = /* @__PURE__ */ O1();
  return wa = function(n) {
    return !!e(n);
  }, wa;
}
var nf;
function t3() {
  return nf || (nf = 1, (function(e) {
    var t = /* @__PURE__ */ L7(), n = $7(), r = /* @__PURE__ */ O1(), o = /* @__PURE__ */ e3();
    function i(P) {
      return P.call.bind(P);
    }
    var a = typeof BigInt < "u", s = typeof Symbol < "u", c = i(Object.prototype.toString), l = i(Number.prototype.valueOf), f = i(String.prototype.valueOf), u = i(Boolean.prototype.valueOf);
    if (a)
      var d = i(BigInt.prototype.valueOf);
    if (s)
      var b = i(Symbol.prototype.valueOf);
    function h(P, nn) {
      if (typeof P != "object")
        return !1;
      try {
        return nn(P), !0;
      } catch {
        return !1;
      }
    }
    e.isArgumentsObject = t, e.isGeneratorFunction = n, e.isTypedArray = o;
    function g(P) {
      return typeof Promise < "u" && P instanceof Promise || P !== null && typeof P == "object" && typeof P.then == "function" && typeof P.catch == "function";
    }
    e.isPromise = g;
    function T(P) {
      return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? ArrayBuffer.isView(P) : o(P) || A(P);
    }
    e.isArrayBufferView = T;
    function m(P) {
      return r(P) === "Uint8Array";
    }
    e.isUint8Array = m;
    function y(P) {
      return r(P) === "Uint8ClampedArray";
    }
    e.isUint8ClampedArray = y;
    function S(P) {
      return r(P) === "Uint16Array";
    }
    e.isUint16Array = S;
    function v(P) {
      return r(P) === "Uint32Array";
    }
    e.isUint32Array = v;
    function _(P) {
      return r(P) === "Int8Array";
    }
    e.isInt8Array = _;
    function E(P) {
      return r(P) === "Int16Array";
    }
    e.isInt16Array = E;
    function I(P) {
      return r(P) === "Int32Array";
    }
    e.isInt32Array = I;
    function k(P) {
      return r(P) === "Float32Array";
    }
    e.isFloat32Array = k;
    function M(P) {
      return r(P) === "Float64Array";
    }
    e.isFloat64Array = M;
    function x(P) {
      return r(P) === "BigInt64Array";
    }
    e.isBigInt64Array = x;
    function q(P) {
      return r(P) === "BigUint64Array";
    }
    e.isBigUint64Array = q;
    function V(P) {
      return c(P) === "[object Map]";
    }
    V.working = typeof Map < "u" && V(/* @__PURE__ */ new Map());
    function ie(P) {
      return typeof Map > "u" ? !1 : V.working ? V(P) : P instanceof Map;
    }
    e.isMap = ie;
    function ce(P) {
      return c(P) === "[object Set]";
    }
    ce.working = typeof Set < "u" && ce(/* @__PURE__ */ new Set());
    function D(P) {
      return typeof Set > "u" ? !1 : ce.working ? ce(P) : P instanceof Set;
    }
    e.isSet = D;
    function K(P) {
      return c(P) === "[object WeakMap]";
    }
    K.working = typeof WeakMap < "u" && K(/* @__PURE__ */ new WeakMap());
    function W(P) {
      return typeof WeakMap > "u" ? !1 : K.working ? K(P) : P instanceof WeakMap;
    }
    e.isWeakMap = W;
    function te(P) {
      return c(P) === "[object WeakSet]";
    }
    te.working = typeof WeakSet < "u" && te(/* @__PURE__ */ new WeakSet());
    function le(P) {
      return te(P);
    }
    e.isWeakSet = le;
    function pe(P) {
      return c(P) === "[object ArrayBuffer]";
    }
    pe.working = typeof ArrayBuffer < "u" && pe(new ArrayBuffer());
    function j(P) {
      return typeof ArrayBuffer > "u" ? !1 : pe.working ? pe(P) : P instanceof ArrayBuffer;
    }
    e.isArrayBuffer = j;
    function w(P) {
      return c(P) === "[object DataView]";
    }
    w.working = typeof ArrayBuffer < "u" && typeof DataView < "u" && w(new DataView(new ArrayBuffer(1), 0, 1));
    function A(P) {
      return typeof DataView > "u" ? !1 : w.working ? w(P) : P instanceof DataView;
    }
    e.isDataView = A;
    var O = typeof SharedArrayBuffer < "u" ? SharedArrayBuffer : void 0;
    function B(P) {
      return c(P) === "[object SharedArrayBuffer]";
    }
    function $(P) {
      return typeof O > "u" ? !1 : (typeof B.working > "u" && (B.working = B(new O())), B.working ? B(P) : P instanceof O);
    }
    e.isSharedArrayBuffer = $;
    function z(P) {
      return c(P) === "[object AsyncFunction]";
    }
    e.isAsyncFunction = z;
    function L(P) {
      return c(P) === "[object Map Iterator]";
    }
    e.isMapIterator = L;
    function F(P) {
      return c(P) === "[object Set Iterator]";
    }
    e.isSetIterator = F;
    function N(P) {
      return c(P) === "[object Generator]";
    }
    e.isGeneratorObject = N;
    function Y(P) {
      return c(P) === "[object WebAssembly.Module]";
    }
    e.isWebAssemblyCompiledModule = Y;
    function Z(P) {
      return h(P, l);
    }
    e.isNumberObject = Z;
    function ue(P) {
      return h(P, f);
    }
    e.isStringObject = ue;
    function he(P) {
      return h(P, u);
    }
    e.isBooleanObject = he;
    function Ke(P) {
      return a && h(P, d);
    }
    e.isBigIntObject = Ke;
    function me(P) {
      return s && h(P, b);
    }
    e.isSymbolObject = me;
    function bn(P) {
      return Z(P) || ue(P) || he(P) || Ke(P) || me(P);
    }
    e.isBoxedPrimitive = bn;
    function Zn(P) {
      return typeof Uint8Array < "u" && (j(P) || $(P));
    }
    e.isAnyArrayBuffer = Zn, ["isProxy", "isExternal", "isModuleNamespaceObject"].forEach(function(P) {
      Object.defineProperty(e, P, {
        enumerable: !1,
        value: function() {
          throw new Error(P + " is not supported in userland");
        }
      });
    });
  })(Si)), Si;
}
var Ea, rf;
function n3() {
  return rf || (rf = 1, Ea = function(t) {
    return t && typeof t == "object" && typeof t.copy == "function" && typeof t.fill == "function" && typeof t.readUInt8 == "function";
  }), Ea;
}
var Wr = { exports: {} }, of;
function r3() {
  return of || (of = 1, typeof Object.create == "function" ? Wr.exports = function(t, n) {
    n && (t.super_ = n, t.prototype = Object.create(n.prototype, {
      constructor: {
        value: t,
        enumerable: !1,
        writable: !0,
        configurable: !0
      }
    }));
  } : Wr.exports = function(t, n) {
    if (n) {
      t.super_ = n;
      var r = function() {
      };
      r.prototype = n.prototype, t.prototype = new r(), t.prototype.constructor = t;
    }
  }), Wr.exports;
}
var af;
function sf() {
  return af || (af = 1, (function(e) {
    var t = Object.getOwnPropertyDescriptors || function(A) {
      for (var O = Object.keys(A), B = {}, $ = 0; $ < O.length; $++)
        B[O[$]] = Object.getOwnPropertyDescriptor(A, O[$]);
      return B;
    }, n = /%[sdj%]/g;
    e.format = function(w) {
      if (!_(w)) {
        for (var A = [], O = 0; O < arguments.length; O++)
          A.push(a(arguments[O]));
        return A.join(" ");
      }
      for (var O = 1, B = arguments, $ = B.length, z = String(w).replace(n, function(F) {
        if (F === "%%") return "%";
        if (O >= $) return F;
        switch (F) {
          case "%s":
            return String(B[O++]);
          case "%d":
            return Number(B[O++]);
          case "%j":
            try {
              return JSON.stringify(B[O++]);
            } catch {
              return "[Circular]";
            }
          default:
            return F;
        }
      }), L = B[O]; O < $; L = B[++O])
        y(L) || !M(L) ? z += " " + L : z += " " + a(L);
      return z;
    }, e.deprecate = function(w, A) {
      if (typeof process < "u" && process.noDeprecation === !0)
        return w;
      if (typeof process > "u")
        return function() {
          return e.deprecate(w, A).apply(this, arguments);
        };
      var O = !1;
      function B() {
        if (!O) {
          if (process.throwDeprecation)
            throw new Error(A);
          process.traceDeprecation ? console.trace(A) : console.error(A), O = !0;
        }
        return w.apply(this, arguments);
      }
      return B;
    };
    var r = {}, o = /^$/;
    if (process.env.NODE_DEBUG) {
      var i = process.env.NODE_DEBUG;
      i = i.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*").replace(/,/g, "$|^").toUpperCase(), o = new RegExp("^" + i + "$", "i");
    }
    e.debuglog = function(w) {
      if (w = w.toUpperCase(), !r[w])
        if (o.test(w)) {
          var A = process.pid;
          r[w] = function() {
            var O = e.format.apply(e, arguments);
            console.error("%s %d: %s", w, A, O);
          };
        } else
          r[w] = function() {
          };
      return r[w];
    };
    function a(w, A) {
      var O = {
        seen: [],
        stylize: c
      };
      return arguments.length >= 3 && (O.depth = arguments[2]), arguments.length >= 4 && (O.colors = arguments[3]), m(A) ? O.showHidden = A : A && e._extend(O, A), I(O.showHidden) && (O.showHidden = !1), I(O.depth) && (O.depth = 2), I(O.colors) && (O.colors = !1), I(O.customInspect) && (O.customInspect = !0), O.colors && (O.stylize = s), f(O, w, O.depth);
    }
    e.inspect = a, a.colors = {
      bold: [1, 22],
      italic: [3, 23],
      underline: [4, 24],
      inverse: [7, 27],
      white: [37, 39],
      grey: [90, 39],
      black: [30, 39],
      blue: [34, 39],
      cyan: [36, 39],
      green: [32, 39],
      magenta: [35, 39],
      red: [31, 39],
      yellow: [33, 39]
    }, a.styles = {
      special: "cyan",
      number: "yellow",
      boolean: "yellow",
      undefined: "grey",
      null: "bold",
      string: "green",
      date: "magenta",
      // "name": intentionally not styling
      regexp: "red"
    };
    function s(w, A) {
      var O = a.styles[A];
      return O ? "\x1B[" + a.colors[O][0] + "m" + w + "\x1B[" + a.colors[O][1] + "m" : w;
    }
    function c(w, A) {
      return w;
    }
    function l(w) {
      var A = {};
      return w.forEach(function(O, B) {
        A[O] = !0;
      }), A;
    }
    function f(w, A, O) {
      if (w.customInspect && A && V(A.inspect) && // Filter out the util module, it's inspect function is special
      A.inspect !== e.inspect && // Also filter out any prototype objects using the circular check.
      !(A.constructor && A.constructor.prototype === A)) {
        var B = A.inspect(O, w);
        return _(B) || (B = f(w, B, O)), B;
      }
      var $ = u(w, A);
      if ($)
        return $;
      var z = Object.keys(A), L = l(z);
      if (w.showHidden && (z = Object.getOwnPropertyNames(A)), q(A) && (z.indexOf("message") >= 0 || z.indexOf("description") >= 0))
        return d(A);
      if (z.length === 0) {
        if (V(A)) {
          var F = A.name ? ": " + A.name : "";
          return w.stylize("[Function" + F + "]", "special");
        }
        if (k(A))
          return w.stylize(RegExp.prototype.toString.call(A), "regexp");
        if (x(A))
          return w.stylize(Date.prototype.toString.call(A), "date");
        if (q(A))
          return d(A);
      }
      var N = "", Y = !1, Z = ["{", "}"];
      if (T(A) && (Y = !0, Z = ["[", "]"]), V(A)) {
        var ue = A.name ? ": " + A.name : "";
        N = " [Function" + ue + "]";
      }
      if (k(A) && (N = " " + RegExp.prototype.toString.call(A)), x(A) && (N = " " + Date.prototype.toUTCString.call(A)), q(A) && (N = " " + d(A)), z.length === 0 && (!Y || A.length == 0))
        return Z[0] + N + Z[1];
      if (O < 0)
        return k(A) ? w.stylize(RegExp.prototype.toString.call(A), "regexp") : w.stylize("[Object]", "special");
      w.seen.push(A);
      var he;
      return Y ? he = b(w, A, O, L, z) : he = z.map(function(Ke) {
        return h(w, A, O, L, Ke, Y);
      }), w.seen.pop(), g(he, N, Z);
    }
    function u(w, A) {
      if (I(A))
        return w.stylize("undefined", "undefined");
      if (_(A)) {
        var O = "'" + JSON.stringify(A).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, '"') + "'";
        return w.stylize(O, "string");
      }
      if (v(A))
        return w.stylize("" + A, "number");
      if (m(A))
        return w.stylize("" + A, "boolean");
      if (y(A))
        return w.stylize("null", "null");
    }
    function d(w) {
      return "[" + Error.prototype.toString.call(w) + "]";
    }
    function b(w, A, O, B, $) {
      for (var z = [], L = 0, F = A.length; L < F; ++L)
        te(A, String(L)) ? z.push(h(
          w,
          A,
          O,
          B,
          String(L),
          !0
        )) : z.push("");
      return $.forEach(function(N) {
        N.match(/^\d+$/) || z.push(h(
          w,
          A,
          O,
          B,
          N,
          !0
        ));
      }), z;
    }
    function h(w, A, O, B, $, z) {
      var L, F, N;
      if (N = Object.getOwnPropertyDescriptor(A, $) || { value: A[$] }, N.get ? N.set ? F = w.stylize("[Getter/Setter]", "special") : F = w.stylize("[Getter]", "special") : N.set && (F = w.stylize("[Setter]", "special")), te(B, $) || (L = "[" + $ + "]"), F || (w.seen.indexOf(N.value) < 0 ? (y(O) ? F = f(w, N.value, null) : F = f(w, N.value, O - 1), F.indexOf(`
`) > -1 && (z ? F = F.split(`
`).map(function(Y) {
        return "  " + Y;
      }).join(`
`).slice(2) : F = `
` + F.split(`
`).map(function(Y) {
        return "   " + Y;
      }).join(`
`))) : F = w.stylize("[Circular]", "special")), I(L)) {
        if (z && $.match(/^\d+$/))
          return F;
        L = JSON.stringify("" + $), L.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/) ? (L = L.slice(1, -1), L = w.stylize(L, "name")) : (L = L.replace(/'/g, "\\'").replace(/\\"/g, '"').replace(/(^"|"$)/g, "'"), L = w.stylize(L, "string"));
      }
      return L + ": " + F;
    }
    function g(w, A, O) {
      var B = w.reduce(function($, z) {
        return z.indexOf(`
`) >= 0, $ + z.replace(/\u001b\[\d\d?m/g, "").length + 1;
      }, 0);
      return B > 60 ? O[0] + (A === "" ? "" : A + `
 `) + " " + w.join(`,
  `) + " " + O[1] : O[0] + A + " " + w.join(", ") + " " + O[1];
    }
    e.types = t3();
    function T(w) {
      return Array.isArray(w);
    }
    e.isArray = T;
    function m(w) {
      return typeof w == "boolean";
    }
    e.isBoolean = m;
    function y(w) {
      return w === null;
    }
    e.isNull = y;
    function S(w) {
      return w == null;
    }
    e.isNullOrUndefined = S;
    function v(w) {
      return typeof w == "number";
    }
    e.isNumber = v;
    function _(w) {
      return typeof w == "string";
    }
    e.isString = _;
    function E(w) {
      return typeof w == "symbol";
    }
    e.isSymbol = E;
    function I(w) {
      return w === void 0;
    }
    e.isUndefined = I;
    function k(w) {
      return M(w) && ce(w) === "[object RegExp]";
    }
    e.isRegExp = k, e.types.isRegExp = k;
    function M(w) {
      return typeof w == "object" && w !== null;
    }
    e.isObject = M;
    function x(w) {
      return M(w) && ce(w) === "[object Date]";
    }
    e.isDate = x, e.types.isDate = x;
    function q(w) {
      return M(w) && (ce(w) === "[object Error]" || w instanceof Error);
    }
    e.isError = q, e.types.isNativeError = q;
    function V(w) {
      return typeof w == "function";
    }
    e.isFunction = V;
    function ie(w) {
      return w === null || typeof w == "boolean" || typeof w == "number" || typeof w == "string" || typeof w == "symbol" || // ES6 symbol
      typeof w > "u";
    }
    e.isPrimitive = ie, e.isBuffer = n3();
    function ce(w) {
      return Object.prototype.toString.call(w);
    }
    function D(w) {
      return w < 10 ? "0" + w.toString(10) : w.toString(10);
    }
    var K = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    function W() {
      var w = /* @__PURE__ */ new Date(), A = [
        D(w.getHours()),
        D(w.getMinutes()),
        D(w.getSeconds())
      ].join(":");
      return [w.getDate(), K[w.getMonth()], A].join(" ");
    }
    e.log = function() {
      console.log("%s - %s", W(), e.format.apply(e, arguments));
    }, e.inherits = r3(), e._extend = function(w, A) {
      if (!A || !M(A)) return w;
      for (var O = Object.keys(A), B = O.length; B--; )
        w[O[B]] = A[O[B]];
      return w;
    };
    function te(w, A) {
      return Object.prototype.hasOwnProperty.call(w, A);
    }
    var le = typeof Symbol < "u" ? /* @__PURE__ */ Symbol("util.promisify.custom") : void 0;
    e.promisify = function(A) {
      if (typeof A != "function")
        throw new TypeError('The "original" argument must be of type Function');
      if (le && A[le]) {
        var O = A[le];
        if (typeof O != "function")
          throw new TypeError('The "util.promisify.custom" argument must be of type Function');
        return Object.defineProperty(O, le, {
          value: O,
          enumerable: !1,
          writable: !1,
          configurable: !0
        }), O;
      }
      function O() {
        for (var B, $, z = new Promise(function(N, Y) {
          B = N, $ = Y;
        }), L = [], F = 0; F < arguments.length; F++)
          L.push(arguments[F]);
        L.push(function(N, Y) {
          N ? $(N) : B(Y);
        });
        try {
          A.apply(this, L);
        } catch (N) {
          $(N);
        }
        return z;
      }
      return Object.setPrototypeOf(O, Object.getPrototypeOf(A)), le && Object.defineProperty(O, le, {
        value: O,
        enumerable: !1,
        writable: !1,
        configurable: !0
      }), Object.defineProperties(
        O,
        t(A)
      );
    }, e.promisify.custom = le;
    function pe(w, A) {
      if (!w) {
        var O = new Error("Promise was rejected with a falsy value");
        O.reason = w, w = O;
      }
      return A(w);
    }
    function j(w) {
      if (typeof w != "function")
        throw new TypeError('The "original" argument must be of type Function');
      function A() {
        for (var O = [], B = 0; B < arguments.length; B++)
          O.push(arguments[B]);
        var $ = O.pop();
        if (typeof $ != "function")
          throw new TypeError("The last argument must be of type Function");
        var z = this, L = function() {
          return $.apply(z, arguments);
        };
        w.apply(this, O).then(
          function(F) {
            process.nextTick(L.bind(null, null, F));
          },
          function(F) {
            process.nextTick(pe.bind(null, F, L));
          }
        );
      }
      return Object.setPrototypeOf(A, Object.getPrototypeOf(w)), Object.defineProperties(
        A,
        t(w)
      ), A;
    }
    e.callbackify = j;
  })(Ei)), Ei;
}
var Sa = {}, cf;
function o3() {
  return cf || (cf = 1, (function(e) {
    (function() {
      var t = {
        not_type: /[^T]/,
        not_primitive: /[^v]/,
        number: /[diefg]/,
        numeric_arg: /[bcdiefguxX]/,
        json: /[j]/,
        text: /^[^\x25]+/,
        modulo: /^\x25{2}/,
        placeholder: /^\x25(?:([1-9]\d*)\$|\(([^)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-gijostTuvxX])/,
        key: /^([a-z_][a-z_\d]*)/i,
        key_access: /^\.([a-z_][a-z_\d]*)/i,
        index_access: /^\[(\d+)\]/,
        sign: /^[+-]/
      };
      function n(s) {
        return o(a(s), arguments);
      }
      function r(s, c) {
        return n.apply(null, [s].concat(c || []));
      }
      function o(s, c) {
        var l = 1, f = s.length, u, d = "", b, h, g, T, m, y, S, v;
        for (b = 0; b < f; b++)
          if (typeof s[b] == "string")
            d += s[b];
          else if (typeof s[b] == "object") {
            if (g = s[b], g.keys)
              for (u = c[l], h = 0; h < g.keys.length; h++) {
                if (u == null)
                  throw new Error(n('[sprintf] Cannot access property "%s" of undefined value "%s"', g.keys[h], g.keys[h - 1]));
                u = u[g.keys[h]];
              }
            else g.param_no ? u = c[g.param_no] : u = c[l++];
            if (t.not_type.test(g.type) && t.not_primitive.test(g.type) && u instanceof Function && (u = u()), t.numeric_arg.test(g.type) && typeof u != "number" && isNaN(u))
              throw new TypeError(n("[sprintf] expecting number but found %T", u));
            switch (t.number.test(g.type) && (S = u >= 0), g.type) {
              case "b":
                u = parseInt(u, 10).toString(2);
                break;
              case "c":
                u = String.fromCharCode(parseInt(u, 10));
                break;
              case "d":
              case "i":
                u = parseInt(u, 10);
                break;
              case "j":
                u = JSON.stringify(u, null, g.width ? parseInt(g.width) : 0);
                break;
              case "e":
                u = g.precision ? parseFloat(u).toExponential(g.precision) : parseFloat(u).toExponential();
                break;
              case "f":
                u = g.precision ? parseFloat(u).toFixed(g.precision) : parseFloat(u);
                break;
              case "g":
                u = g.precision ? String(Number(u.toPrecision(g.precision))) : parseFloat(u);
                break;
              case "o":
                u = (parseInt(u, 10) >>> 0).toString(8);
                break;
              case "s":
                u = String(u), u = g.precision ? u.substring(0, g.precision) : u;
                break;
              case "t":
                u = String(!!u), u = g.precision ? u.substring(0, g.precision) : u;
                break;
              case "T":
                u = Object.prototype.toString.call(u).slice(8, -1).toLowerCase(), u = g.precision ? u.substring(0, g.precision) : u;
                break;
              case "u":
                u = parseInt(u, 10) >>> 0;
                break;
              case "v":
                u = u.valueOf(), u = g.precision ? u.substring(0, g.precision) : u;
                break;
              case "x":
                u = (parseInt(u, 10) >>> 0).toString(16);
                break;
              case "X":
                u = (parseInt(u, 10) >>> 0).toString(16).toUpperCase();
                break;
            }
            t.json.test(g.type) ? d += u : (t.number.test(g.type) && (!S || g.sign) ? (v = S ? "+" : "-", u = u.toString().replace(t.sign, "")) : v = "", m = g.pad_char ? g.pad_char === "0" ? "0" : g.pad_char.charAt(1) : " ", y = g.width - (v + u).length, T = g.width && y > 0 ? m.repeat(y) : "", d += g.align ? v + u + T : m === "0" ? v + T + u : T + v + u);
          }
        return d;
      }
      var i = /* @__PURE__ */ Object.create(null);
      function a(s) {
        if (i[s])
          return i[s];
        for (var c = s, l, f = [], u = 0; c; ) {
          if ((l = t.text.exec(c)) !== null)
            f.push(l[0]);
          else if ((l = t.modulo.exec(c)) !== null)
            f.push("%");
          else if ((l = t.placeholder.exec(c)) !== null) {
            if (l[2]) {
              u |= 1;
              var d = [], b = l[2], h = [];
              if ((h = t.key.exec(b)) !== null)
                for (d.push(h[1]); (b = b.substring(h[0].length)) !== ""; )
                  if ((h = t.key_access.exec(b)) !== null)
                    d.push(h[1]);
                  else if ((h = t.index_access.exec(b)) !== null)
                    d.push(h[1]);
                  else
                    throw new SyntaxError("[sprintf] failed to parse named argument key");
              else
                throw new SyntaxError("[sprintf] failed to parse named argument key");
              l[2] = d;
            } else
              u |= 2;
            if (u === 3)
              throw new Error("[sprintf] mixing positional and named placeholders is not (yet) supported");
            f.push(
              {
                placeholder: l[0],
                param_no: l[1],
                keys: l[2],
                sign: l[3],
                pad_char: l[4],
                align: l[5],
                width: l[6],
                precision: l[7],
                type: l[8]
              }
            );
          } else
            throw new SyntaxError("[sprintf] unexpected placeholder");
          c = c.substring(l[0].length);
        }
        return i[s] = f;
      }
      e.sprintf = n, e.vsprintf = r, typeof window < "u" && (window.sprintf = n, window.vsprintf = r);
    })();
  })(Sa)), Sa;
}
var Zr = { exports: {} }, lf;
function i3() {
  if (lf) return Zr.exports;
  lf = 1;
  var e = typeof Reflect == "object" ? Reflect : null, t = e && typeof e.apply == "function" ? e.apply : function(_, E, I) {
    return Function.prototype.apply.call(_, E, I);
  }, n;
  e && typeof e.ownKeys == "function" ? n = e.ownKeys : Object.getOwnPropertySymbols ? n = function(_) {
    return Object.getOwnPropertyNames(_).concat(Object.getOwnPropertySymbols(_));
  } : n = function(_) {
    return Object.getOwnPropertyNames(_);
  };
  function r(v) {
    console && console.warn && console.warn(v);
  }
  var o = Number.isNaN || function(_) {
    return _ !== _;
  };
  function i() {
    i.init.call(this);
  }
  Zr.exports = i, Zr.exports.once = m, i.EventEmitter = i, i.prototype._events = void 0, i.prototype._eventsCount = 0, i.prototype._maxListeners = void 0;
  var a = 10;
  function s(v) {
    if (typeof v != "function")
      throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof v);
  }
  Object.defineProperty(i, "defaultMaxListeners", {
    enumerable: !0,
    get: function() {
      return a;
    },
    set: function(v) {
      if (typeof v != "number" || v < 0 || o(v))
        throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + v + ".");
      a = v;
    }
  }), i.init = function() {
    (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) && (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0), this._maxListeners = this._maxListeners || void 0;
  }, i.prototype.setMaxListeners = function(_) {
    if (typeof _ != "number" || _ < 0 || o(_))
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + _ + ".");
    return this._maxListeners = _, this;
  };
  function c(v) {
    return v._maxListeners === void 0 ? i.defaultMaxListeners : v._maxListeners;
  }
  i.prototype.getMaxListeners = function() {
    return c(this);
  }, i.prototype.emit = function(_) {
    for (var E = [], I = 1; I < arguments.length; I++) E.push(arguments[I]);
    var k = _ === "error", M = this._events;
    if (M !== void 0)
      k = k && M.error === void 0;
    else if (!k)
      return !1;
    if (k) {
      var x;
      if (E.length > 0 && (x = E[0]), x instanceof Error)
        throw x;
      var q = new Error("Unhandled error." + (x ? " (" + x.message + ")" : ""));
      throw q.context = x, q;
    }
    var V = M[_];
    if (V === void 0)
      return !1;
    if (typeof V == "function")
      t(V, this, E);
    else
      for (var ie = V.length, ce = h(V, ie), I = 0; I < ie; ++I)
        t(ce[I], this, E);
    return !0;
  };
  function l(v, _, E, I) {
    var k, M, x;
    if (s(E), M = v._events, M === void 0 ? (M = v._events = /* @__PURE__ */ Object.create(null), v._eventsCount = 0) : (M.newListener !== void 0 && (v.emit(
      "newListener",
      _,
      E.listener ? E.listener : E
    ), M = v._events), x = M[_]), x === void 0)
      x = M[_] = E, ++v._eventsCount;
    else if (typeof x == "function" ? x = M[_] = I ? [E, x] : [x, E] : I ? x.unshift(E) : x.push(E), k = c(v), k > 0 && x.length > k && !x.warned) {
      x.warned = !0;
      var q = new Error("Possible EventEmitter memory leak detected. " + x.length + " " + String(_) + " listeners added. Use emitter.setMaxListeners() to increase limit");
      q.name = "MaxListenersExceededWarning", q.emitter = v, q.type = _, q.count = x.length, r(q);
    }
    return v;
  }
  i.prototype.addListener = function(_, E) {
    return l(this, _, E, !1);
  }, i.prototype.on = i.prototype.addListener, i.prototype.prependListener = function(_, E) {
    return l(this, _, E, !0);
  };
  function f() {
    if (!this.fired)
      return this.target.removeListener(this.type, this.wrapFn), this.fired = !0, arguments.length === 0 ? this.listener.call(this.target) : this.listener.apply(this.target, arguments);
  }
  function u(v, _, E) {
    var I = { fired: !1, wrapFn: void 0, target: v, type: _, listener: E }, k = f.bind(I);
    return k.listener = E, I.wrapFn = k, k;
  }
  i.prototype.once = function(_, E) {
    return s(E), this.on(_, u(this, _, E)), this;
  }, i.prototype.prependOnceListener = function(_, E) {
    return s(E), this.prependListener(_, u(this, _, E)), this;
  }, i.prototype.removeListener = function(_, E) {
    var I, k, M, x, q;
    if (s(E), k = this._events, k === void 0)
      return this;
    if (I = k[_], I === void 0)
      return this;
    if (I === E || I.listener === E)
      --this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : (delete k[_], k.removeListener && this.emit("removeListener", _, I.listener || E));
    else if (typeof I != "function") {
      for (M = -1, x = I.length - 1; x >= 0; x--)
        if (I[x] === E || I[x].listener === E) {
          q = I[x].listener, M = x;
          break;
        }
      if (M < 0)
        return this;
      M === 0 ? I.shift() : g(I, M), I.length === 1 && (k[_] = I[0]), k.removeListener !== void 0 && this.emit("removeListener", _, q || E);
    }
    return this;
  }, i.prototype.off = i.prototype.removeListener, i.prototype.removeAllListeners = function(_) {
    var E, I, k;
    if (I = this._events, I === void 0)
      return this;
    if (I.removeListener === void 0)
      return arguments.length === 0 ? (this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0) : I[_] !== void 0 && (--this._eventsCount === 0 ? this._events = /* @__PURE__ */ Object.create(null) : delete I[_]), this;
    if (arguments.length === 0) {
      var M = Object.keys(I), x;
      for (k = 0; k < M.length; ++k)
        x = M[k], x !== "removeListener" && this.removeAllListeners(x);
      return this.removeAllListeners("removeListener"), this._events = /* @__PURE__ */ Object.create(null), this._eventsCount = 0, this;
    }
    if (E = I[_], typeof E == "function")
      this.removeListener(_, E);
    else if (E !== void 0)
      for (k = E.length - 1; k >= 0; k--)
        this.removeListener(_, E[k]);
    return this;
  };
  function d(v, _, E) {
    var I = v._events;
    if (I === void 0)
      return [];
    var k = I[_];
    return k === void 0 ? [] : typeof k == "function" ? E ? [k.listener || k] : [k] : E ? T(k) : h(k, k.length);
  }
  i.prototype.listeners = function(_) {
    return d(this, _, !0);
  }, i.prototype.rawListeners = function(_) {
    return d(this, _, !1);
  }, i.listenerCount = function(v, _) {
    return typeof v.listenerCount == "function" ? v.listenerCount(_) : b.call(v, _);
  }, i.prototype.listenerCount = b;
  function b(v) {
    var _ = this._events;
    if (_ !== void 0) {
      var E = _[v];
      if (typeof E == "function")
        return 1;
      if (E !== void 0)
        return E.length;
    }
    return 0;
  }
  i.prototype.eventNames = function() {
    return this._eventsCount > 0 ? n(this._events) : [];
  };
  function h(v, _) {
    for (var E = new Array(_), I = 0; I < _; ++I)
      E[I] = v[I];
    return E;
  }
  function g(v, _) {
    for (; _ + 1 < v.length; _++)
      v[_] = v[_ + 1];
    v.pop();
  }
  function T(v) {
    for (var _ = new Array(v.length), E = 0; E < _.length; ++E)
      _[E] = v[E].listener || v[E];
    return _;
  }
  function m(v, _) {
    return new Promise(function(E, I) {
      function k(x) {
        v.removeListener(_, M), I(x);
      }
      function M() {
        typeof v.removeListener == "function" && v.removeListener("error", k), E([].slice.call(arguments));
      }
      S(v, _, M, { once: !0 }), _ !== "error" && y(v, k, { once: !0 });
    });
  }
  function y(v, _, E) {
    typeof v.on == "function" && S(v, "error", _, E);
  }
  function S(v, _, E, I) {
    if (typeof v.on == "function")
      I.once ? v.once(_, E) : v.on(_, E);
    else if (typeof v.addEventListener == "function")
      v.addEventListener(_, function k(M) {
        I.once && v.removeEventListener(_, k), E(M);
      });
    else
      throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof v);
  }
  return Zr.exports;
}
var Ta, uf;
function a3() {
  if (uf) return Ta;
  uf = 1;
  var e = [].indexOf;
  return Ta = function(t, n) {
    if (e) return t.indexOf(n);
    for (var r = 0; r < t.length; ++r)
      if (t[r] === n) return r;
    return -1;
  }, Ta;
}
var Aa, ff;
function s3() {
  if (ff) return Aa;
  ff = 1;
  var e = Array.prototype, t = e.concat, n = e.slice, r = a3();
  function o(i) {
    var a = {}, s = t.apply(e, n.call(arguments, 1));
    for (var c in i)
      r(s, c) === -1 && (a[c] = i[c]);
    return a;
  }
  return Aa = o, Aa;
}
var Ia, df;
function j1() {
  return df || (df = 1, Ia = {
    __locale: "en",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    abbreviated_days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    abbreviated_months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    am: "AM",
    pm: "PM"
  }), Ia;
}
var Oa, pf;
function c3() {
  return pf || (pf = 1, Oa = j1()), Oa;
}
var ja, hf;
function l3() {
  if (hf) return ja;
  hf = 1;
  var e = c3();
  function t(a, s, c) {
    var l = a.getTime();
    return c = c || e, s.replace(/%([-_0]?.)/g, function(f, u) {
      var d = null;
      if (u.length == 2) {
        switch (u[0]) {
          case "-":
            d = "";
            break;
          case "_":
            d = " ";
            break;
          case "0":
            d = "0";
            break;
          default:
            return f;
        }
        u = u[1];
      }
      switch (u) {
        case "A":
          return c.days[a.getDay()];
        case "a":
          return c.abbreviated_days[a.getDay()];
        case "B":
          return c.months[a.getMonth()];
        case "b":
          return c.abbreviated_months[a.getMonth()];
        case "C":
          return n(Math.floor(a.getFullYear() / 100), d);
        case "D":
          return t(a, "%m/%d/%y");
        case "d":
          return n(a.getDate(), d);
        case "e":
          return a.getDate();
        case "F":
          return t(a, "%Y-%m-%d");
        case "H":
          return n(a.getHours(), d);
        case "h":
          return c.abbreviated_months[a.getMonth()];
        case "I":
          return n(r(a), d);
        case "j":
          return n(Math.ceil((a.getTime() - new Date(a.getFullYear(), 0, 1).getTime()) / (1e3 * 60 * 60 * 24)), 3);
        case "k":
          return n(a.getHours(), d === null ? " " : d);
        case "L":
          return n(Math.floor(l % 1e3), 3);
        case "l":
          return n(r(a), d === null ? " " : d);
        case "M":
          return n(a.getMinutes(), d);
        case "m":
          return n(a.getMonth() + 1, d);
        case "n":
          return `
`;
        case "o":
          return String(a.getDate()) + o(a.getDate());
        case "P":
          return a.getHours() < 12 ? c.am.toLowerCase() : c.pm.toLowerCase();
        case "p":
          return a.getHours() < 12 ? c.am.toUpperCase() : c.pm.toUpperCase();
        case "R":
          return t(a, "%H:%M");
        case "r":
          return t(a, "%I:%M:%S %p");
        case "S":
          return n(a.getSeconds(), d);
        case "s":
          return Math.floor(l / 1e3);
        case "T":
          return t(a, "%H:%M:%S");
        case "t":
          return "	";
        case "U":
          return n(i(a, "sunday"), d);
        case "u":
          return a.getDay() === 0 ? 7 : a.getDay();
        case "v":
          return t(a, "%e-%b-%Y");
        case "W":
          return n(i(a, "monday"), d);
        case "w":
          return a.getDay();
        case "Y":
          return a.getFullYear();
        case "y":
          var b = String(a.getFullYear());
          return b.slice(b.length - 2);
        case "Z":
          var h = a.toString().match(/\((\w+)\)/);
          return h && h[1] || "";
        case "z":
          var g = a.getTimezoneOffset();
          return (g > 0 ? "-" : "+") + n(Math.round(Math.abs(g / 60)), 2) + ":" + n(g % 60, 2);
        default:
          return u;
      }
    });
  }
  function n(a, s, c) {
    typeof s == "number" && (c = s, s = "0"), s === null && (s = "0"), c = c || 2;
    var l = String(a);
    if (s)
      for (; l.length < c; )
        l = s + l;
    return l;
  }
  function r(a) {
    var s = a.getHours();
    return s === 0 ? s = 12 : s > 12 && (s -= 12), s;
  }
  function o(a) {
    var s = a % 10, c = a % 100;
    if (c >= 11 && c <= 13 || s === 0 || s >= 4)
      return "th";
    switch (s) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
    }
  }
  function i(a, s) {
    s = s || "sunday";
    var c = a.getDay();
    s == "monday" && (c === 0 ? c = 6 : c--);
    var l = new Date(a.getFullYear(), 0, 1), f = (a - l) / 864e5, u = (f + 7 - c) / 7;
    return Math.floor(u);
  }
  return ja = t, ja;
}
var Pa, mf;
function u3() {
  return mf || (mf = 1, Pa = function(e, t) {
    var n;
    return t === 0 && "zero" in e && (n = "zero"), n = n || (t === 1 ? "one" : "other"), e[n];
  }), Pa;
}
var ka, gf;
function f3() {
  return gf || (gf = 1, ka = {
    counterpart: {
      names: j1(),
      pluralize: u3(),
      formats: {
        date: {
          default: "%a, %e %b %Y",
          long: "%A, %B %o, %Y",
          short: "%b %e"
        },
        time: {
          default: "%H:%M",
          long: "%H:%M:%S %z",
          short: "%H:%M"
        },
        datetime: {
          default: "%a, %e %b %Y %H:%M",
          long: "%A, %B %o, %Y %H:%M:%S %z",
          short: "%e %b %H:%M"
        }
      }
    }
  }), ka;
}
var Ra, yf;
function d3() {
  if (yf) return Ra;
  yf = 1;
  var e = w7(), t = sf().isArray, n = sf().isDate, r = o3().sprintf, o = i3(), i = s3(), a = l3(), s = "counterpart";
  function c(m) {
    return typeof m == "string" || Object.prototype.toString.call(m) === "[object String]";
  }
  function l(m) {
    return typeof m == "function" || Object.prototype.toString.call(m) === "[object Function]";
  }
  function f(m) {
    return m === null ? !1 : Object.prototype.toString.call(m) === "[object Object]";
  }
  function u(m) {
    return c(m) && m[0] === ":";
  }
  function d(m, y) {
    return Object.prototype.hasOwnProperty.call(m, y);
  }
  function b(m, y) {
    return y.reduce(function(S, v) {
      return f(S) && d(S, v) ? S[v] : null;
    }, m);
  }
  function h() {
    o.EventEmitter.apply(this), this._registry = {
      locale: "en",
      interpolate: !0,
      fallbackLocales: [],
      scope: null,
      translations: {},
      interpolations: {},
      normalizedKeys: {},
      separator: ".",
      keepTrailingDot: !1,
      keyTransformer: function(m) {
        return m;
      },
      generateMissingEntry: function(m) {
        return "missing translation: " + m;
      }
    }, this.registerTranslations("en", f3()), this.setMaxListeners(0);
  }
  h.prototype = o.EventEmitter.prototype, h.prototype.constructor = o.EventEmitter, h.prototype.getLocale = function() {
    return this._registry.locale;
  }, h.prototype.setLocale = function(m) {
    var y = this._registry.locale;
    return y != m && (this._registry.locale = m, this.emit("localechange", m, y)), y;
  }, h.prototype.getFallbackLocale = function() {
    return this._registry.fallbackLocales;
  }, h.prototype.setFallbackLocale = function(m) {
    var y = this._registry.fallbackLocales;
    return this._registry.fallbackLocales = [].concat(m || []), y;
  }, h.prototype.getAvailableLocales = function() {
    return this._registry.availableLocales || Object.keys(this._registry.translations);
  }, h.prototype.setAvailableLocales = function(m) {
    var y = this.getAvailableLocales();
    return this._registry.availableLocales = m, y;
  }, h.prototype.getSeparator = function() {
    return this._registry.separator;
  }, h.prototype.setSeparator = function(m) {
    var y = this._registry.separator;
    return this._registry.separator = m, y;
  }, h.prototype.setInterpolate = function(m) {
    var y = this._registry.interpolate;
    return this._registry.interpolate = m, y;
  }, h.prototype.getInterpolate = function() {
    return this._registry.interpolate;
  }, h.prototype.setKeyTransformer = function(m) {
    var y = this._registry.keyTransformer;
    return this._registry.keyTransformer = m, y;
  }, h.prototype.getKeyTransformer = function() {
    return this._registry.keyTransformer;
  }, h.prototype.setMissingEntryGenerator = function(m) {
    var y = this._registry.generateMissingEntry;
    return this._registry.generateMissingEntry = m, y;
  }, h.prototype.getMissingEntryGenerator = function() {
    return this._registry.generateMissingEntry;
  }, h.prototype.registerTranslations = function(m, y) {
    var S = {};
    return S[m] = y, e(!0, this._registry.translations, S), S;
  }, h.prototype.registerInterpolations = function(m) {
    return e(!0, this._registry.interpolations, m);
  }, h.prototype.onLocaleChange = h.prototype.addLocaleChangeListener = function(m) {
    this.addListener("localechange", m);
  }, h.prototype.offLocaleChange = h.prototype.removeLocaleChangeListener = function(m) {
    this.removeListener("localechange", m);
  }, h.prototype.onTranslationNotFound = h.prototype.addTranslationNotFoundListener = function(m) {
    this.addListener("translationnotfound", m);
  }, h.prototype.offTranslationNotFound = h.prototype.removeTranslationNotFoundListener = function(m) {
    this.removeListener("translationnotfound", m);
  }, h.prototype.onError = h.prototype.addErrorListener = function(m) {
    this.addListener("error", m);
  }, h.prototype.offError = h.prototype.removeErrorListener = function(m) {
    this.removeListener("error", m);
  }, h.prototype.translate = function(m, y) {
    if (!t(m) && !c(m) || !m.length)
      throw new Error("invalid argument: key");
    u(m) && (m = m.substr(1)), m = this._registry.keyTransformer(m, y), y = e(!0, {}, y);
    var S = y.locale || this._registry.locale;
    delete y.locale;
    var v = y.scope || this._registry.scope;
    delete y.scope;
    var _ = y.separator || this._registry.separator;
    delete y.separator;
    var E = [].concat(y.fallbackLocale || this._registry.fallbackLocales);
    delete y.fallbackLocale;
    var I = this._normalizeKeys(S, v, m, _), k = b(this._registry.translations, I);
    if (k === null && (this.emit("translationnotfound", S, m, y.fallback, v), y.fallback && (k = this._fallback(S, v, m, y.fallback, y))), k === null && E.length > 0 && E.indexOf(S) === -1)
      for (var M = 0, x = E.length; M < x; M++) {
        var q = E[M], V = this._normalizeKeys(q, v, m, _);
        if (k = b(this._registry.translations, V), k) {
          S = q;
          break;
        }
      }
    return k === null && (k = this._registry.generateMissingEntry(I.join(_))), k = this._pluralize(S, k, y.count), this._registry.interpolate !== !1 && y.interpolate !== !1 && (k = this._interpolate(k, y)), k;
  }, h.prototype.localize = function(m, y) {
    if (!n(m))
      throw new Error("invalid argument: object must be a date");
    y = e(!0, {}, y);
    var S = y.locale || this._registry.locale, v = y.scope || s, _ = y.type || "datetime", E = y.format || "default";
    return y = { locale: S, scope: v, interpolate: !1 }, E = this.translate(["formats", _, E], e(!0, {}, y)), a(m, E, this.translate("names", y));
  }, h.prototype._pluralize = function(m, y, S) {
    if (typeof y != "object" || y === null || typeof S != "number")
      return y;
    var v = this.translate("pluralize", { locale: m, scope: s });
    return Object.prototype.toString.call(v) !== "[object Function]" ? v : v(y, S);
  }, h.prototype.withLocale = function(m, y, S) {
    var v = this._registry.locale;
    this._registry.locale = m;
    var _ = y.call(S);
    return this._registry.locale = v, _;
  }, h.prototype.withScope = function(m, y, S) {
    var v = this._registry.scope;
    this._registry.scope = m;
    var _ = y.call(S);
    return this._registry.scope = v, _;
  }, h.prototype.withSeparator = function(m, y, S) {
    var v = this.setSeparator(m), _ = y.call(S);
    return this.setSeparator(v), _;
  }, h.prototype._normalizeKeys = function(m, y, S, v) {
    var _ = [];
    return _ = _.concat(this._normalizeKey(m, v)), _ = _.concat(this._normalizeKey(y, v)), _ = _.concat(this._normalizeKey(S, v)), _;
  }, h.prototype._normalizeKey = function(m, y) {
    return this._registry.normalizedKeys[y] = this._registry.normalizedKeys[y] || {}, this._registry.normalizedKeys[y][m] = this._registry.normalizedKeys[y][m] || (function(S) {
      if (t(S)) {
        var v = S.map((function(I) {
          return this._normalizeKey(I, y);
        }).bind(this));
        return [].concat.apply([], v);
      } else {
        if (typeof S > "u" || S === null)
          return [];
        for (var _ = S.split(y), E = _.length - 1; E >= 0; E--)
          _[E] === "" && (_.splice(E, 1), this._registry.keepTrailingDot === !0 && E == _.length && (_[_.length - 1] += "" + y));
        return _;
      }
    }).bind(this)(m), this._registry.normalizedKeys[y][m];
  }, h.prototype._interpolate = function(m, y) {
    if (typeof m != "string")
      return m;
    try {
      return r(m, e({}, this._registry.interpolations, y));
    } catch (S) {
      if (this.listenerCount("error") > 0)
        this.emit("error", S, m, y);
      else
        throw S;
      return null;
    }
  }, h.prototype._resolve = function(m, y, S, v, _) {
    if (_ = _ || {}, _.resolve === !1)
      return v;
    var E;
    if (u(v))
      E = this.translate(v, e({}, _, { locale: m, scope: y }));
    else if (l(v)) {
      var I;
      _.object ? (I = _.object, delete _.object) : I = S, E = this._resolve(m, y, S, v(I, _));
    } else
      E = v;
    return /^missing translation:/.test(E) ? null : E;
  }, h.prototype._fallback = function(m, y, S, v, _) {
    if (_ = i(_, "fallback"), t(v)) {
      for (var E = 0, I = v.length; E < I; E++) {
        var k = this._resolve(m, y, S, v[E], _);
        if (k)
          return k;
      }
      return null;
    } else
      return this._resolve(m, y, S, v, _);
  };
  var g = new h();
  function T() {
    return g.translate.apply(g, arguments);
  }
  return e(T, g, {
    Instance: h,
    Translator: h
  }), Ra = T, Ra;
}
var p3 = d3();
const We = /* @__PURE__ */ xf(p3), P1 = "i18n/";
We.setSeparator(_7);
const k1 = "en";
We.setFallbackLocale(k1);
function h3(e, t) {
  We.registerTranslations(e, t);
}
function M8(e) {
  We.setMissingEntryGenerator(e);
}
function m3() {
  return We.getLocale();
}
function C8(e) {
  return We.setLocale(e);
}
function x8(e) {
  return e;
}
function vf(e) {
  return typeof e == "string" && !e.startsWith("missing translation:");
}
const g3 = (e, t) => {
  const n = We.translate(e, { ...t, fallbackLocale: We.getLocale() });
  if (vf(n))
    return { translated: n };
  const r = We.translate(e, { ...t, locale: k1 });
  return vf(r) ? { translated: r, isFallback: !0 } : { translated: e, isFallback: !0 };
};
function Nc(e, t) {
  const n = { ...t, interpolate: !1 };
  return n && typeof n == "object" && Object.keys(n).forEach((r) => {
    n[r] === void 0 && (console.warn("safeCounterpartTranslate called with undefined interpolation name: " + r), n[r] = "undefined"), n[r] === null && (console.warn("safeCounterpartTranslate called with null interpolation name: " + r), n[r] = "null");
  }), g3(e, n);
}
const bf = /* @__PURE__ */ new Map();
function y3(e) {
  let t = bf.get(e);
  return t || (t = new RegExp(e, "g"), bf.set(e, t)), t;
}
const R1 = (e, t) => e;
function C(e, t, n) {
  const { translated: r } = Nc(e, t), o = M1(r, t, n);
  return R1(o);
}
function N8(e) {
  return Nc(e, {}).translated;
}
function z8(e, t, n) {
  const { translated: r, isFallback: o } = Nc(e, t), i = M1(r, t, n);
  return R1(o ? /* @__PURE__ */ p.createElement("span", { lang: "en" }, i) : i);
}
function B8(e) {
  return e.replace(/%\(([^)]*)\)/g, "% ($1)");
}
function M1(e, t, n) {
  let r = e;
  if (t !== void 0) {
    const o = {};
    for (const i in t)
      o[`%\\(${i}\\)s`] = t[i];
    r = _f(r, o);
  }
  if (n !== void 0) {
    const o = {};
    for (const i in n)
      o[`(<${i}>(.*?)<\\/${i}>|<${i}>|<${i}\\s*\\/>)`] = n[i];
    r = _f(r, o);
  }
  return r;
}
function _f(e, t) {
  const n = [e];
  let r = !1;
  for (const o in t) {
    const i = y3(o);
    let a = !1;
    for (let s = 0; s < n.length; s++) {
      const c = n[s];
      if (typeof c != "string")
        continue;
      i.lastIndex = 0;
      let l = i.exec(c);
      if (!l) continue;
      a = !0;
      const f = c.slice(0, l.index), u = [];
      let d;
      for (; l; ) {
        d = l;
        const b = l.slice(2);
        let h;
        t[o] instanceof Function ? h = t[o](...b) : h = t[o], typeof h == "object" && (r = !0), (typeof h != "string" || h !== "") && u.push(h), l = i.exec(c);
        let g;
        if (l) {
          const T = d.index + d[0].length;
          g = c.slice(T, l.index);
        } else
          g = c.slice(d.index + d[0].length);
        g && u.push(g);
      }
      n.splice(s, 1, ...u), f !== "" && n.splice(s, 0, f);
    }
    a || // The current regexp did not match anything in the input. Missing
    // matches is entirely possible because you might choose to show some
    // variables only in the case of e.g. plurals. It's still a bit
    // suspicious, and could be due to an error, so log it. However, not
    // showing count is so common that it's not worth logging. And other
    // commonly unused variables here, if there are any.
    o !== "%\\(count\\)s" && // Ignore the `locale` option which can be used to override the locale
    // in counterpart
    o !== "%\\(locale\\)s" && console.log(`Could not find ${i} in ${e}`);
  }
  return r ? p.createElement("span", null, ...n) : n.join("");
}
async function F8(e) {
  const t = await b3(), n = e in t ? e : "en", r = await v3(P1 + t[n]);
  We.registerTranslations(n, r), We.setLocale(n);
}
async function v3(e) {
  console.log("Loading language from", e);
  const t = await fetch(e, { method: "GET" });
  if (!t.ok)
    throw new Error(`Failed to load ${e}, got ${t.status}`);
  return t.json();
}
async function b3() {
  const e = P1 + "languages.json", t = await fetch(e, { method: "GET" });
  if (!t.ok)
    throw new Error(`Failed to load ${e}, got ${t.status}`);
  return t.json();
}
function rr({
  type: e,
  children: t,
  avatar: n,
  className: r,
  actions: o,
  onClose: i,
  ...a
}) {
  const s = _e(Yr.banner, r), c = at(() => {
    switch (e) {
      case "critical":
        return /* @__PURE__ */ p.createElement(g1, { fontSize: 24 });
      case "info":
        return /* @__PURE__ */ p.createElement(nu, { fontSize: 24 });
      case "success":
        return /* @__PURE__ */ p.createElement(h7, { fontSize: 24 });
      default:
        return /* @__PURE__ */ p.createElement(nu, { fontSize: 24 });
    }
  }, [e]);
  return /* @__PURE__ */ p.createElement("div", { ...a, className: s, "data-type": e }, /* @__PURE__ */ p.createElement("div", { className: Yr.icon }, n ?? c), /* @__PURE__ */ p.createElement("div", { className: Yr.content }, t), /* @__PURE__ */ p.createElement("div", { className: Yr.actions }, o, i && /* @__PURE__ */ p.createElement(Fe, { kind: "secondary", size: "sm", onClick: i }, C("action|dismiss"))));
}
const _3 = /* @__PURE__ */ JSON.parse(`[{"number":0,"emoji":"🐶","description":"Dog","unicode":"U+1F436","translated_descriptions":{"ar":"كلب","bg":"Куче","ca":"Gos","cs":"Pes","de":"Hund","eo":"Hundo","es":"Perro","et":"Koer","fa":"سگ","fi":"Koira","fr":"Chien","hr":"pas","hu":"Kutya","id":"Anjing","it":"Cane","ja":"犬","nb_NO":"Hund","nl":"Hond","pt":"Cão","pt_BR":"Cachorro","ru":"Собака","si":"බල්ලා","sk":"Pes","sq":"Qen","sr":"пас","sv":"Hund","szl":null,"tzm":"Aydi","uk":"Пес","vi":"Chó","zh_Hans":"狗","zh_Hant":"狗"}},{"number":1,"emoji":"🐱","description":"Cat","unicode":"U+1F431","translated_descriptions":{"ar":"هِرَّة","bg":"Котка","ca":"Gat","cs":"Kočka","de":"Katze","eo":"Kato","es":"Gato","et":"Kass","fa":"گربه","fi":"Kissa","fr":"Chat","hr":"mačka","hu":"Macska","id":"Kucing","it":"Gatto","ja":"猫","nb_NO":"Katt","nl":"Kat","pt":"Gato","pt_BR":"Gato","ru":"Кошка","si":"පූසා","sk":"Mačka","sq":"Mace","sr":"мачка","sv":"Katt","szl":null,"tzm":"Amuc","uk":"Кіт","vi":"Mèo","zh_Hans":"猫","zh_Hant":"貓"}},{"number":2,"emoji":"🦁","description":"Lion","unicode":"U+1F981","translated_descriptions":{"ar":"أَسَد","bg":"Лъв","ca":"Lleó","cs":"Lev","de":"Löwe","eo":"Leono","es":"León","et":"Lõvi","fa":"شیر","fi":"Leijona","fr":"Lion","hr":"lav","hu":"Oroszlán","id":"Singa","it":"Leone","ja":"ライオン","nb_NO":"Løve","nl":"Leeuw","pt":"Leão","pt_BR":"Leão","ru":"Лев","si":"සිංහයා","sk":"Lev","sq":"Luan","sr":"лав","sv":"Lejon","szl":null,"tzm":"Izem","uk":"Лев","vi":"Sư tử","zh_Hans":"狮子","zh_Hant":"獅子"}},{"number":3,"emoji":"🐎","description":"Horse","unicode":"U+1F40E","translated_descriptions":{"ar":"حِصَان","bg":"Кон","ca":"Cavall","cs":"Kůň","de":"Pferd","eo":"Ĉevalo","es":"Caballo","et":"Hobune","fa":"اسب","fi":"Hevonen","fr":"Cheval","hr":"konj","hu":"Ló","id":"Kuda","it":"Cavallo","ja":"馬","nb_NO":"Hest","nl":"Paard","pt":"Cavalo","pt_BR":"Cavalo","ru":"Лошадь","si":"අශ්වයා","sk":"Kôň","sq":"Kalë","sr":"коњ","sv":"Häst","szl":null,"tzm":"Ayyis","uk":"Кінь","vi":"Ngựa","zh_Hans":"马","zh_Hant":"馬"}},{"number":4,"emoji":"🦄","description":"Unicorn","unicode":"U+1F984","translated_descriptions":{"ar":"حصان وحيد القرن","bg":"Еднорог","ca":"Unicorn","cs":"Jednorožec","de":"Einhorn","eo":"Unukorno","es":"Unicornio","et":"Ükssarvik","fa":"تک شاخ","fi":"Yksisarvinen","fr":"Licorne","hr":"jednorog","hu":"Egyszarvú","id":"Unicorn","it":"Unicorno","ja":"ユニコーン","nb_NO":"Enhjørning","nl":"Eenhoorn","pt":"Unicórnio","pt_BR":"Unicórnio","ru":"Единорог","si":null,"sk":"Jednorožec","sq":"Njëbrirësh","sr":"једнорог","sv":"Enhörning","szl":null,"tzm":null,"uk":"Єдиноріг","vi":"Kỳ lân","zh_Hans":"独角兽","zh_Hant":"獨角獸"}},{"number":5,"emoji":"🐷","description":"Pig","unicode":"U+1F437","translated_descriptions":{"ar":"خِنزِير","bg":"Прасе","ca":"Porc","cs":"Prase","de":"Schwein","eo":"Porko","es":"Cerdo","et":"Siga","fa":"خوک","fi":"Sika","fr":"Cochon","hr":"svinja","hu":"Malac","id":"Babi","it":"Maiale","ja":"ブタ","nb_NO":"Gris","nl":"Varken","pt":"Porco","pt_BR":"Porco","ru":"Свинья","si":null,"sk":"Prasa","sq":"Derr","sr":"прасе","sv":"Gris","szl":null,"tzm":"Ilef","uk":"Свиня","vi":"Heo","zh_Hans":"猪","zh_Hant":"豬"}},{"number":6,"emoji":"🐘","description":"Elephant","unicode":"U+1F418","translated_descriptions":{"ar":"فِيل","bg":"Слон","ca":"Elefant","cs":"Slon","de":"Elefant","eo":"Elefanto","es":"Elefante","et":"Elevant","fa":"فیل","fi":"Norsu","fr":"Éléphant","hr":"slon","hu":"Elefánt","id":"Gajah","it":"Elefante","ja":"ゾウ","nb_NO":"Elefant","nl":"Olifant","pt":"Elefante","pt_BR":"Elefante","ru":"Слон","si":null,"sk":"Slon","sq":"Elefant","sr":"слон","sv":"Elefant","szl":null,"tzm":"Ilu","uk":"Слон","vi":"Voi","zh_Hans":"大象","zh_Hant":"大象"}},{"number":7,"emoji":"🐰","description":"Rabbit","unicode":"U+1F430","translated_descriptions":{"ar":"أَرنَب","bg":"Заек","ca":"Conill","cs":"Králík","de":"Hase","eo":"Kuniklo","es":"Conejo","et":"Jänes","fa":"خرگوش","fi":"Kani","fr":"Lapin","hr":"zec","hu":"Nyúl","id":"Kelinci","it":"Coniglio","ja":"うさぎ","nb_NO":"Kanin","nl":"Konijn","pt":"Coelho","pt_BR":"Coelho","ru":"Кролик","si":null,"sk":"Zajac","sq":"Lepur","sr":"зец","sv":"Kanin","szl":null,"tzm":"Agnin","uk":"Кріль","vi":"Thỏ","zh_Hans":"兔子","zh_Hant":"兔子"}},{"number":8,"emoji":"🐼","description":"Panda","unicode":"U+1F43C","translated_descriptions":{"ar":"باندَا","bg":"Панда","ca":"Panda","cs":"Panda","de":"Panda","eo":"Pando","es":"Panda","et":"Panda","fa":"پاندا","fi":"Panda","fr":"Panda","hr":"panda","hu":"Panda","id":"Panda","it":"Panda","ja":"パンダ","nb_NO":"Panda","nl":"Panda","pt":"Panda","pt_BR":"Panda","ru":"Панда","si":null,"sk":"Panda","sq":"Panda","sr":"панда","sv":"Panda","szl":null,"tzm":null,"uk":"Панда","vi":"Gấu trúc","zh_Hans":"熊猫","zh_Hant":"熊貓"}},{"number":9,"emoji":"🐓","description":"Rooster","unicode":"U+1F413","translated_descriptions":{"ar":"دِيك","bg":"Петел","ca":"Gall","cs":"Kohout","de":"Hahn","eo":"Virkoko","es":"Gallo","et":"Kukk","fa":"خروس","fi":"Kukko","fr":"Coq","hr":"kokot","hu":"Kakas","id":"Ayam","it":"Gallo","ja":"ニワトリ","nb_NO":"Hane","nl":"Haan","pt":"Galo","pt_BR":"Galo","ru":"Петух","si":null,"sk":"Kohút","sq":"Këndes","sr":"петао","sv":"Tupp","szl":null,"tzm":"Ayaẓiḍ","uk":"Когут","vi":"Gà trống","zh_Hans":"公鸡","zh_Hant":"公雞"}},{"number":10,"emoji":"🐧","description":"Penguin","unicode":"U+1F427","translated_descriptions":{"ar":"بطريق","bg":"Пингвин","ca":"Pingüí","cs":"Tučňák","de":"Pinguin","eo":"Pingveno","es":"Pingüino","et":"Pingviin","fa":"پنگوئن","fi":"Pingviini","fr":"Manchot","hr":"pingvin","hu":"Pingvin","id":"Penguin","it":"Pinguino","ja":"ペンギン","nb_NO":"Pingvin","nl":"Pinguïn","pt":"Pinguim","pt_BR":"Pinguim","ru":"Пингвин","si":null,"sk":"Tučniak","sq":"Pinguin","sr":"пингвин","sv":"Pingvin","szl":null,"tzm":null,"uk":"Пінгвін","vi":"Chim cánh cụt","zh_Hans":"企鹅","zh_Hant":"企鵝"}},{"number":11,"emoji":"🐢","description":"Turtle","unicode":"U+1F422","translated_descriptions":{"ar":"سُلحفاة","bg":"Костенурка","ca":"Tortuga","cs":"Želva","de":"Schildkröte","eo":"Testudo","es":"Tortuga","et":"Kilpkonn","fa":"لاک‌پشت","fi":"Kilpikonna","fr":"Tortue","hr":"kornjača","hu":"Teknős","id":"Kura-Kura","it":"Tartaruga","ja":"亀","nb_NO":"Skilpadde","nl":"Schildpad","pt":"Tartaruga","pt_BR":"Tartaruga","ru":"Черепаха","si":null,"sk":"Korytnačka","sq":"Breshkë","sr":"корњача","sv":"Sköldpadda","szl":null,"tzm":"Ifker","uk":"Черепаха","vi":"Rùa","zh_Hans":"乌龟","zh_Hant":"烏龜"}},{"number":12,"emoji":"🐟","description":"Fish","unicode":"U+1F41F","translated_descriptions":{"ar":"سَمَكة","bg":"Риба","ca":"Peix","cs":"Ryba","de":"Fisch","eo":"Fiŝo","es":"Pez","et":"Kala","fa":"ماهی","fi":"Kala","fr":"Poisson","hr":"riba","hu":"Hal","id":"Ikan","it":"Pesce","ja":"魚","nb_NO":"Fisk","nl":"Vis","pt":"Peixe","pt_BR":"Peixe","ru":"Рыба","si":null,"sk":"Ryba","sq":"Peshk","sr":"риба","sv":"Fisk","szl":null,"tzm":"Aselm","uk":"Риба","vi":"Cá","zh_Hans":"鱼","zh_Hant":"魚"}},{"number":13,"emoji":"🐙","description":"Octopus","unicode":"U+1F419","translated_descriptions":{"ar":"أُخطُبُوط","bg":"Октопод","ca":"Pop","cs":"Chobotnice","de":"Oktopus","eo":"Polpo","es":"Pulpo","et":"Kaheksajalg","fa":"اختاپوس","fi":"Tursas","fr":"Poulpe","hr":"hobotnica","hu":"Polip","id":"Gurita","it":"Polpo","ja":"たこ","nb_NO":"Blekksprut","nl":"Octopus","pt":"Polvo","pt_BR":"Polvo","ru":"Осьминог","si":null,"sk":"Chobotnica","sq":"Oktapod","sr":"октопод","sv":"Bläckfisk","szl":null,"tzm":null,"uk":"Восьминіг","vi":"Bạch tuộc","zh_Hans":"章鱼","zh_Hant":"章魚"}},{"number":14,"emoji":"🦋","description":"Butterfly","unicode":"U+1F98B","translated_descriptions":{"ar":"فَرَاشَة","bg":"Пеперуда","ca":"Papallona","cs":"Motýl","de":"Schmetterling","eo":"Papilio","es":"Mariposa","et":"Liblikas","fa":"پروانه","fi":"Perhonen","fr":"Papillon","hr":"leptir","hu":"Pillangó","id":"Kupu-Kupu","it":"Farfalla","ja":"ちょうちょ","nb_NO":"Sommerfugl","nl":"Vlinder","pt":"Borboleta","pt_BR":"Borboleta","ru":"Бабочка","si":null,"sk":"Motýľ","sq":"Flutur","sr":"лептир","sv":"Fjäril","szl":null,"tzm":null,"uk":"Метелик","vi":"Bướm","zh_Hans":"蝴蝶","zh_Hant":"蝴蝶"}},{"number":15,"emoji":"🌷","description":"Flower","unicode":"U+1F337","translated_descriptions":{"ar":"زَهرَة","bg":"Цвете","ca":"Flor","cs":"Květina","de":"Blume","eo":"Floro","es":"Flor","et":"Lill","fa":"گل","fi":"Kukka","fr":"Fleur","hr":"svijet","hu":"Virág","id":"Bunga","it":"Fiore","ja":"花","nb_NO":"Blomst","nl":"Bloem","pt":"Flor","pt_BR":"Flor","ru":"Цветок","si":null,"sk":"Kvet","sq":"Lule","sr":"цвет","sv":"Blomma","szl":null,"tzm":null,"uk":"Квітка","vi":"Hoa","zh_Hans":"花","zh_Hant":"花"}},{"number":16,"emoji":"🌳","description":"Tree","unicode":"U+1F333","translated_descriptions":{"ar":"شَجَرَة","bg":"Дърво","ca":"Arbre","cs":"Strom","de":"Baum","eo":"Arbo","es":"Árbol","et":"Puu","fa":"درخت","fi":"Puu","fr":"Arbre","hr":"drvo","hu":"Fa","id":"Pohon","it":"Albero","ja":"木","nb_NO":"Tre","nl":"Boom","pt":"Árvore","pt_BR":"Árvore","ru":"Дерево","si":null,"sk":"Strom","sq":"Pemë","sr":"дрво","sv":"Träd","szl":null,"tzm":"Aseklu","uk":"Дерево","vi":"Cây","zh_Hans":"树","zh_Hant":"樹"}},{"number":17,"emoji":"🌵","description":"Cactus","unicode":"U+1F335","translated_descriptions":{"ar":"صبار","bg":"Кактус","ca":"Cactus","cs":"Kaktus","de":"Kaktus","eo":"Kakto","es":"Cactus","et":"Kaktus","fa":"کاکتوس","fi":"Kaktus","fr":"Cactus","hr":"kaktus","hu":"Kaktusz","id":"Kaktus","it":"Cactus","ja":"サボテン","nb_NO":"Kaktus","nl":"Cactus","pt":"Cato","pt_BR":"Cacto","ru":"Кактус","si":null,"sk":"Kaktus","sq":"Kaktus","sr":"кактус","sv":"Kaktus","szl":null,"tzm":null,"uk":"Кактус","vi":"Xương rồng","zh_Hans":"仙人掌","zh_Hant":"仙人掌"}},{"number":18,"emoji":"🍄","description":"Mushroom","unicode":"U+1F344","translated_descriptions":{"ar":"فُطر","bg":"Гъба","ca":"Bolet","cs":"Houba","de":"Pilz","eo":"Fungo","es":"Seta","et":"Seen","fa":"قارچ","fi":"Sieni","fr":"Champignon","hr":"gljiva","hu":"Gomba","id":"Jamur","it":"Fungo","ja":"きのこ","nb_NO":"Sopp","nl":"Paddenstoel","pt":"Cogumelo","pt_BR":"Cogumelo","ru":"Гриб","si":null,"sk":"Huba","sq":"Kërpudhë","sr":"печурка","sv":"Svamp","szl":null,"tzm":"Agursel","uk":"Гриб","vi":"Nấm","zh_Hans":"蘑菇","zh_Hant":"蘑菇"}},{"number":19,"emoji":"🌏","description":"Globe","unicode":"U+1F30F","translated_descriptions":{"ar":"كُرَةٌ أرضِيَّة","bg":"Глобус","ca":"Globus terraqüi","cs":"Zeměkoule","de":"Globus","eo":"Globo","es":"Globo","et":"Maakera","fa":"زمین","fi":"Maapallo","fr":"Globe","hr":"Globus","hu":"Földgömb","id":"Bola Dunia","it":"Globo","ja":"地球","nb_NO":"Globus","nl":"Wereldbol","pt":"Globo","pt_BR":"Globo","ru":"Глобус","si":null,"sk":"Zemeguľa","sq":"Rruzull","sr":"глобус","sv":"Jordklot","szl":null,"tzm":null,"uk":"Глобус","vi":"Địa cầu","zh_Hans":"地球","zh_Hant":"地球"}},{"number":20,"emoji":"🌙","description":"Moon","unicode":"U+1F319","translated_descriptions":{"ar":"قَمَر","bg":"Луна","ca":"Lluna","cs":"Měsíc","de":"Mond","eo":"Luno","es":"Luna","et":"Kuu","fa":"ماه","fi":"Kuu","fr":"Lune","hr":"mjesec","hu":"Hold","id":"Bulan","it":"Luna","ja":"月","nb_NO":"Måne","nl":"Maan","pt":"Lua","pt_BR":"Lua","ru":"Луна","si":null,"sk":"Mesiac","sq":"Hënë","sr":"месец","sv":"Måne","szl":null,"tzm":"Ayyur","uk":"Місяць","vi":"Mặt trăng","zh_Hans":"月亮","zh_Hant":"月亮"}},{"number":21,"emoji":"☁️","description":"Cloud","unicode":"U+2601U+FE0F","translated_descriptions":{"ar":"سَحابَة","bg":"Облак","ca":"Núvol","cs":"Mrak","de":"Wolke","eo":"Nubo","es":"Nube","et":"Pilv","fa":"ابر","fi":"Pilvi","fr":"Nuage","hr":"oblak","hu":"Felhő","id":"Awan","it":"Nuvola","ja":"雲","nb_NO":"Sky","nl":"Wolk","pt":"Nuvem","pt_BR":"Nuvem","ru":"Облако","si":null,"sk":"Oblak","sq":"Re","sr":"облак","sv":"Moln","szl":null,"tzm":null,"uk":"Хмара","vi":"Mây","zh_Hans":"云","zh_Hant":"雲朵"}},{"number":22,"emoji":"🔥","description":"Fire","unicode":"U+1F525","translated_descriptions":{"ar":"نار","bg":"Огън","ca":"Foc","cs":"Oheň","de":"Feuer","eo":"Fajro","es":"Fuego","et":"Tuli","fa":"آتش","fi":"Tuli","fr":"Feu","hr":"vatra","hu":"Tűz","id":"Api","it":"Fuoco","ja":"炎","nb_NO":"Flamme","nl":"Vuur","pt":"Fogo","pt_BR":"Fogo","ru":"Огонь","si":null,"sk":"Oheň","sq":"Zjarr","sr":"ватра","sv":"Eld","szl":null,"tzm":"Timessi","uk":"Вогонь","vi":"Lửa","zh_Hans":"火","zh_Hant":"火"}},{"number":23,"emoji":"🍌","description":"Banana","unicode":"U+1F34C","translated_descriptions":{"ar":"مَوزَة","bg":"Банан","ca":"Plàtan","cs":"Banán","de":"Banane","eo":"Banano","es":"Plátano","et":"Banaan","fa":"موز","fi":"Banaani","fr":"Banane","hr":"banana","hu":"Banán","id":"Pisang","it":"Banana","ja":"バナナ","nb_NO":"Banan","nl":"Banaan","pt":"Banana","pt_BR":"Banana","ru":"Банан","si":null,"sk":"Banán","sq":"Banane","sr":"банана","sv":"Banan","szl":null,"tzm":"Tabanant","uk":"Банан","vi":"Chuối","zh_Hans":"香蕉","zh_Hant":"香蕉"}},{"number":24,"emoji":"🍎","description":"Apple","unicode":"U+1F34E","translated_descriptions":{"ar":"تُفَّاحَة","bg":"Ябълка","ca":"Poma","cs":"Jablko","de":"Apfel","eo":"Pomo","es":"Manzana","et":"Õun","fa":"سیب","fi":"Omena","fr":"Pomme","hr":"jabuka","hu":"Alma","id":"Apel","it":"Mela","ja":"リンゴ","nb_NO":"Eple","nl":"Appel","pt":"Maçã","pt_BR":"Maçã","ru":"Яблоко","si":null,"sk":"Jablko","sq":"Mollë","sr":"јабука","sv":"Äpple","szl":null,"tzm":"Tadeffuyt","uk":"Яблуко","vi":"Táo","zh_Hans":"苹果","zh_Hant":"蘋果"}},{"number":25,"emoji":"🍓","description":"Strawberry","unicode":"U+1F353","translated_descriptions":{"ar":"فَراوِلَة","bg":"Ягода","ca":"Maduixa","cs":"Jahoda","de":"Erdbeere","eo":"Frago","es":"Fresa","et":"Maasikas","fa":"توت فرنگی","fi":"Mansikka","fr":"Fraise","hr":"jagoda","hu":"Eper","id":"Stroberi","it":"Fragola","ja":"いちご","nb_NO":"Jordbær","nl":"Aardbei","pt":"Morango","pt_BR":"Morango","ru":"Клубника","si":null,"sk":"Jahoda","sq":"Luleshtrydhe","sr":"јагода","sv":"Jordgubbe","szl":null,"tzm":null,"uk":"Полуниця","vi":"Dâu tây","zh_Hans":"草莓","zh_Hant":"草莓"}},{"number":26,"emoji":"🌽","description":"Corn","unicode":"U+1F33D","translated_descriptions":{"ar":"ذُرَة","bg":"Царевица","ca":"Blat de moro","cs":"Kukuřice","de":"Mais","eo":"Maizo","es":"Maíz","et":"Mais","fa":"ذرت","fi":"Maissi","fr":"Maïs","hr":"kukuruza","hu":"Kukorica","id":"Jagung","it":"Mais","ja":"とうもろこし","nb_NO":"Mais","nl":"Maïs","pt":"Milho","pt_BR":"Milho","ru":"Кукуруза","si":null,"sk":"Kukurica","sq":"Misër","sr":"кукуруз","sv":"Majs","szl":null,"tzm":null,"uk":"Кукурудза","vi":"Bắp","zh_Hans":"玉米","zh_Hant":"玉米"}},{"number":27,"emoji":"🍕","description":"Pizza","unicode":"U+1F355","translated_descriptions":{"ar":"بِيتزا","bg":"Пица","ca":"Pizza","cs":"Pizza","de":"Pizza","eo":"Pico","es":"Pizza","et":"Pitsa","fa":"پیتزا","fi":"Pizza","fr":"Pizza","hr":"pizza","hu":"Pizza","id":"Pizza","it":"Pizza","ja":"ピザ","nb_NO":"Pizza","nl":"Pizza","pt":"Piza","pt_BR":"Pizza","ru":"Пицца","si":null,"sk":"Pizza","sq":"Picë","sr":"пица","sv":"Pizza","szl":null,"tzm":null,"uk":"Піца","vi":"Pizza","zh_Hans":"披萨","zh_Hant":"披薩"}},{"number":28,"emoji":"🎂","description":"Cake","unicode":"U+1F382","translated_descriptions":{"ar":"كَعكَة","bg":"Торта","ca":"Pastís","cs":"Dort","de":"Kuchen","eo":"Torto","es":"Tarta","et":"Kook","fa":"کیک","fi":"Kakku","fr":"Gâteau","hr":"torta","hu":"Süti","id":"Kue","it":"Torta","ja":"ケーキ","nb_NO":"Kake","nl":"Taart","pt":"Bolo","pt_BR":"Bolo","ru":"Торт","si":null,"sk":"Torta","sq":"Tortë","sr":"торта","sv":"Tårta","szl":null,"tzm":null,"uk":"Пиріг","vi":"Bánh","zh_Hans":"蛋糕","zh_Hant":"蛋糕"}},{"number":29,"emoji":"❤️","description":"Heart","unicode":"U+2764U+FE0F","translated_descriptions":{"ar":"قَلب","bg":"Сърце","ca":"Cor","cs":"Srdce","de":"Herz","eo":"Koro","es":"Corazón","et":"Süda","fa":"قلب","fi":"Sydän","fr":"Cœur","hr":"srca","hu":"Szív","id":"Hati","it":"Cuore","ja":"ハート","nb_NO":"Hjerte","nl":"Hart","pt":"Coração","pt_BR":"Coração","ru":"Сердце","si":null,"sk":"Srdce","sq":"Zemër","sr":"срце","sv":"Hjärta","szl":null,"tzm":"Ul","uk":"Серце","vi":"Tim","zh_Hans":"心","zh_Hant":"愛心"}},{"number":30,"emoji":"😀","description":"Smiley","unicode":"U+1F600","translated_descriptions":{"ar":"اِبتِسَامَة","bg":"Усмивка","ca":"Somrient","cs":"Smajlík","de":"Lächeln","eo":"Rideto","es":"Emoticono","et":"Smaili","fa":"خنده","fi":"Hymynaama","fr":"Sourire","hr":"smajlića","hu":"Mosoly","id":"Senyuman","it":"Faccina sorridente","ja":"スマイル","nb_NO":"Smilefjes","nl":"Smiley","pt":"Sorriso","pt_BR":"Sorriso","ru":"Улыбка","si":null,"sk":"Smajlík","sq":"Emotikon","sr":"смајли","sv":"Smiley","szl":null,"tzm":null,"uk":"Посмішка","vi":"Mặt cười","zh_Hans":"笑脸","zh_Hant":"笑臉"}},{"number":31,"emoji":"🤖","description":"Robot","unicode":"U+1F916","translated_descriptions":{"ar":"رُوبُوت","bg":"Робот","ca":"Robot","cs":"Robot","de":"Roboter","eo":"Roboto","es":"Robot","et":"Robot","fa":"ربات","fi":"Robotti","fr":"Robot","hr":"robot","hu":"Robot","id":"Robot","it":"Robot","ja":"ロボット","nb_NO":"Robot","nl":"Robot","pt":"Robô","pt_BR":"Robô","ru":"Робот","si":null,"sk":"Robot","sq":"Robot","sr":"робот","sv":"Robot","szl":null,"tzm":"Aṛubu","uk":"Робот","vi":"Rô-bô","zh_Hans":"机器人","zh_Hant":"機器人"}},{"number":32,"emoji":"🎩","description":"Hat","unicode":"U+1F3A9","translated_descriptions":{"ar":"قُبَّعَة","bg":"Шапка","ca":"Barret","cs":"Klobouk","de":"Hut","eo":"Ĉapelo","es":"Sombrero","et":"Kübar","fa":"کلاه","fi":"Hattu","fr":"Chapeau","hr":"kapa","hu":"Kalap","id":"Topi","it":"Cappello","ja":"帽子","nb_NO":"Hatt","nl":"Hoed","pt":"Chapéu","pt_BR":"Chapéu","ru":"Шляпа","si":null,"sk":"Klobúk","sq":"Kapë","sr":"шешир","sv":"Hatt","szl":null,"tzm":"Taraza","uk":"Капелюх","vi":"Mũ","zh_Hans":"帽子","zh_Hant":"帽子"}},{"number":33,"emoji":"👓","description":"Glasses","unicode":"U+1F453","translated_descriptions":{"ar":"نَظَّارَة","bg":"Очила","ca":"Ulleres","cs":"Brýle","de":"Brille","eo":"Okulvitroj","es":"Gafas","et":"Prillid","fa":"عینک","fi":"Silmälasit","fr":"Lunettes","hr":"naočale","hu":"Szemüveg","id":"Kacamata","it":"Occhiali","ja":"めがね","nb_NO":"Briller","nl":"Bril","pt":"Óculos","pt_BR":"Óculos","ru":"Очки","si":null,"sk":"Okuliare","sq":"Syze","sr":"наочаре","sv":"Glasögon","szl":null,"tzm":null,"uk":"Окуляри","vi":"Kính mắt","zh_Hans":"眼镜","zh_Hant":"眼鏡"}},{"number":34,"emoji":"🔧","description":"Spanner","unicode":"U+1F527","translated_descriptions":{"ar":"مِفتَاحُ رَبط","bg":"Гаечен ключ","ca":"Clau anglesa","cs":"Klíč","de":"Schraubenschlüssel","eo":"Ŝraŭbŝlosilo","es":"Llave inglesa","et":"Mutrivõti","fa":"آچار","fi":"Kiintoavain","fr":"Clé à molette","hr":"ključ","hu":"Csavarkulcs","id":"Kunci Bengkel","it":"Chiave inglese","ja":"スパナ","nb_NO":"Fastnøkkel","nl":"Moersleutel","pt":"Chave inglesa","pt_BR":"Chave inglesa","ru":"Ключ","si":null,"sk":"Vidlicový kľúč","sq":"Çelës","sr":"кључ","sv":"Skruvnyckel","szl":null,"tzm":null,"uk":"Гайковий ключ","vi":"Cờ-lê","zh_Hans":"扳手","zh_Hant":"扳手"}},{"number":35,"emoji":"🎅","description":"Santa","unicode":"U+1F385","translated_descriptions":{"ar":"سانتا","bg":"Дядо Коледа","ca":"Pare Noél","cs":"Mikuláš","de":"Weihnachtsmann","eo":"Kristnaska viro","es":"Papá Noel","et":"Jõuluvana","fa":"بابا نوئل","fi":"Joulupukki","fr":"Père Noël","hr":"deda Mraz","hu":"Télapó","id":"Santa","it":"Babbo Natale","ja":"サンタ","nb_NO":"Julenisse","nl":"Kerstman","pt":"Pai Natal","pt_BR":"Papai-noel","ru":"Санта","si":null,"sk":"Mikuláš","sq":"Babagjyshi i Vitit të Ri","sr":"деда Мраз","sv":"Tomte","szl":null,"tzm":null,"uk":"Санта Клаус","vi":"ông già Nô-en","zh_Hans":"圣诞老人","zh_Hant":"聖誕老人"}},{"number":36,"emoji":"👍","description":"Thumbs Up","unicode":"U+1F44D","translated_descriptions":{"ar":"رَفعُ إِبهَام","bg":"Палец нагоре","ca":"Polzes amunt","cs":"Palec nahoru","de":"Daumen Hoch","eo":"Dikfingro supren","es":"Pulgar arriba","et":"Pöidlad püsti","fa":"لایک","fi":"Peukalo ylös","fr":"Pouce en l’air","hr":"palac gore","hu":"Hüvelykujj fel","id":"Jempol","it":"Pollice alzato","ja":"いいね","nb_NO":"Tommel Opp","nl":"Duim omhoog","pt":"Polegar para cima","pt_BR":"Joinha","ru":"Большой палец вверх","si":null,"sk":"Palec nahor","sq":null,"sr":"палчић горе","sv":"Tummen upp","szl":null,"tzm":null,"uk":"Великий палець вгору","vi":"Thích","zh_Hans":"赞","zh_Hant":"讚"}},{"number":37,"emoji":"☂️","description":"Umbrella","unicode":"U+2602U+FE0F","translated_descriptions":{"ar":"مِظَلَّة","bg":"Чадър","ca":"Paraigües","cs":"Deštník","de":"Regenschirm","eo":"Ombrelo","es":"Paraguas","et":"Vihmavari","fa":"چتر","fi":"Sateenvarjo","fr":"Parapluie","hr":"kišobran","hu":"Esernyő","id":"Payung","it":"Ombrello","ja":"傘","nb_NO":"Paraply","nl":"Paraplu","pt":"Guarda-chuva","pt_BR":"Guarda-chuva","ru":"Зонт","si":null,"sk":"Dáždnik","sq":"Ombrellë","sr":"кишобран","sv":"Paraply","szl":null,"tzm":null,"uk":"Парасолька","vi":"Cái ô","zh_Hans":"伞","zh_Hant":"雨傘"}},{"number":38,"emoji":"⌛","description":"Hourglass","unicode":"U+231B","translated_descriptions":{"ar":"سَاعَةٌ رَملِيَّة","bg":"Пясъчен часовник","ca":"Rellotge de sorra","cs":"Přesýpací hodiny","de":"Sanduhr","eo":"Sablohorloĝo","es":"Reloj de arena","et":"Liivakell","fa":"ساعت شنی","fi":"Tiimalasi","fr":"Sablier","hr":"pješčani sat","hu":"Homokóra","id":"Jam Pasir","it":"Clessidra","ja":"砂時計","nb_NO":"Timeglass","nl":"Zandloper","pt":"Ampulheta","pt_BR":"Ampulheta","ru":"Песочные часы","si":null,"sk":"Presýpacie hodiny","sq":"Klepsidër","sr":"пешчаник","sv":"Timglas","szl":null,"tzm":null,"uk":"Пісковий годинник","vi":"Đồng hồ cát","zh_Hans":"沙漏","zh_Hant":"沙漏"}},{"number":39,"emoji":"⏰","description":"Clock","unicode":"U+23F0","translated_descriptions":{"ar":"سَاعَة","bg":"Часовник","ca":"Rellotge","cs":"Hodiny","de":"Uhr","eo":"Horloĝo","es":"Reloj","et":"Kell","fa":"ساعت","fi":"Pöytäkello","fr":"Réveil","hr":"sat","hu":"Óra","id":"Jam","it":"Orologio","ja":"時計","nb_NO":"Klokke","nl":"Wekker","pt":"Relógio","pt_BR":"Relógio","ru":"Часы","si":null,"sk":"Budík","sq":"Sahat","sr":"сат","sv":"Klocka","szl":null,"tzm":null,"uk":"Годинник","vi":"Đồng hồ","zh_Hans":"时钟","zh_Hant":"時鐘"}},{"number":40,"emoji":"🎁","description":"Gift","unicode":"U+1F381","translated_descriptions":{"ar":"هَدِيَّة","bg":"Подарък","ca":"Regal","cs":"Dárek","de":"Geschenk","eo":"Donaco","es":"Regalo","et":"Kingitus","fa":"هدیه","fi":"Lahja","fr":"Cadeau","hr":"poklon","hu":"Ajándék","id":"Kado","it":"Regalo","ja":"ギフト","nb_NO":"Gave","nl":"Geschenk","pt":"Presente","pt_BR":"Presente","ru":"Подарок","si":null,"sk":"Darček","sq":"Dhuratë","sr":"поклон","sv":"Present","szl":null,"tzm":null,"uk":"Подарунок","vi":"Quà tặng","zh_Hans":"礼物","zh_Hant":"禮物"}},{"number":41,"emoji":"💡","description":"Light Bulb","unicode":"U+1F4A1","translated_descriptions":{"ar":"مِصبَاح","bg":"Лампа","ca":"Bombeta","cs":"Žárovka","de":"Glühbirne","eo":"Lampo","es":"Bombilla","et":"Lambipirn","fa":"لامپ","fi":"Hehkulamppu","fr":"Ampoule","hr":"žarulja","hu":"Égő","id":"Bohlam Lampu","it":"Lampadina","ja":"電球","nb_NO":"Lyspære","nl":"Gloeilamp","pt":"Lâmpada","pt_BR":"Lâmpada","ru":"Лампочка","si":null,"sk":"Žiarovka","sq":"Llambë","sr":"сијалица","sv":"Lampa","szl":null,"tzm":null,"uk":"Лампочка","vi":"Bóng đèn tròn","zh_Hans":"灯泡","zh_Hant":"燈泡"}},{"number":42,"emoji":"📕","description":"Book","unicode":"U+1F4D5","translated_descriptions":{"ar":"كِتَاب","bg":"Книга","ca":"Llibre","cs":"Kniha","de":"Buch","eo":"Libro","es":"Libro","et":"Raamat","fa":"کتاب","fi":"Kirja","fr":"Livre","hr":"knjiga","hu":"Könyv","id":"Buku","it":"Libro","ja":"本","nb_NO":"Bok","nl":"Boek","pt":"Livro","pt_BR":"Livro","ru":"Книга","si":null,"sk":"Kniha","sq":"Libër","sr":"књига","sv":"Bok","szl":null,"tzm":"Adlis","uk":"Книга","vi":"Sách","zh_Hans":"书","zh_Hant":"書"}},{"number":43,"emoji":"✏️","description":"Pencil","unicode":"U+270FU+FE0F","translated_descriptions":{"ar":"قَلَمُ رَصاص","bg":"Молив","ca":"Llapis","cs":"Tužka","de":"Bleistift","eo":"Krajono","es":"Lápiz","et":"Pliiats","fa":"مداد","fi":"Lyijykynä","fr":"Crayon","hr":"olovka","hu":"Ceruza","id":"Pensil","it":"Matita","ja":"鉛筆","nb_NO":"Blyant","nl":"Potlood","pt":"Lápis","pt_BR":"Lápis","ru":"Карандаш","si":null,"sk":"Ceruzka","sq":"Laps","sr":"оловка","sv":"Penna","szl":null,"tzm":null,"uk":"Олівець","vi":"Viết chì","zh_Hans":"铅笔","zh_Hant":"鉛筆"}},{"number":44,"emoji":"📎","description":"Paperclip","unicode":"U+1F4CE","translated_descriptions":{"ar":"مِشبَكُ وَرَق","bg":"Кламер","ca":"Clip","cs":"Sponka","de":"Büroklammer","eo":"Paperkuntenilo","es":"Clip","et":"Kirjaklamber","fa":"گیره کاغذ","fi":"Paperiliitin","fr":"Trombone","hr":"spajalica","hu":"Gémkapocs","id":"Klip Kertas","it":"Graffetta","ja":"クリップ","nb_NO":"BInders","nl":"Papierklemmetje","pt":"Clipe","pt_BR":"Clipe de papel","ru":"Скрепка","si":null,"sk":"Kancelárska sponka","sq":"Kapëse","sr":"спајалица","sv":"Gem","szl":null,"tzm":null,"uk":"Спиначка","vi":"Kẹp giấy","zh_Hans":"回形针","zh_Hant":"迴紋針"}},{"number":45,"emoji":"✂️","description":"Scissors","unicode":"U+2702U+FE0F","translated_descriptions":{"ar":"مِقَصّ","bg":"Ножици","ca":"Tisores","cs":"Nůžky","de":"Schere","eo":"Tondilo","es":"Tijeras","et":"Käärid","fa":"قیچی","fi":"Sakset","fr":"Ciseaux","hr":"škare","hu":"Olló","id":"Gunting","it":"Forbici","ja":"はさみ","nb_NO":"Saks","nl":"Schaar","pt":"Tesoura","pt_BR":"Tesoura","ru":"Ножницы","si":null,"sk":"Nožnice","sq":"Gërshërë","sr":"маказе","sv":"Sax","szl":null,"tzm":null,"uk":"Ножиці","vi":"Cái kéo","zh_Hans":"剪刀","zh_Hant":"剪刀"}},{"number":46,"emoji":"🔒","description":"Lock","unicode":"U+1F512","translated_descriptions":{"ar":"قُفل","bg":"Катинар","ca":"Cadenat","cs":"Zámek","de":"Schloss","eo":"Seruro","es":"Candado","et":"Lukk","fa":"قفل","fi":"Lukko","fr":"Cadenas","hr":"zaključati","hu":"Lakat","id":"Gembok","it":"Lucchetto","ja":"錠前","nb_NO":"Lås","nl":"Slot","pt":"Cadeado","pt_BR":"Cadeado","ru":"Замок","si":null,"sk":"Zámka","sq":"Dry","sr":"катанац","sv":"Lås","szl":null,"tzm":null,"uk":"Замок","vi":"Ổ khóa","zh_Hans":"锁","zh_Hant":"鎖頭"}},{"number":47,"emoji":"🔑","description":"Key","unicode":"U+1F511","translated_descriptions":{"ar":"مِفتَاح","bg":"Ключ","ca":"Clau","cs":"Klíč ke dveřím","de":"Schlüssel","eo":"Ŝlosilo","es":"Llave","et":"Võti","fa":"کلید","fi":"Avain","fr":"Clé","hr":"ključ","hu":"Kulcs","id":"Kunci","it":"Chiave","ja":"鍵","nb_NO":"Nøkkel","nl":"Sleutel","pt":"Chave","pt_BR":"Chave","ru":"Ключ","si":null,"sk":"Kľúč","sq":"Çelës","sr":"кључ","sv":"Nyckel","szl":null,"tzm":"Tasarut","uk":"Ключ","vi":"Chìa khóa","zh_Hans":"钥匙","zh_Hant":"鑰匙"}},{"number":48,"emoji":"🔨","description":"Hammer","unicode":"U+1F528","translated_descriptions":{"ar":"مِطرَقَة","bg":"Чук","ca":"Martell","cs":"Kladivo","de":"Hammer","eo":"Martelo","es":"Martillo","et":"Haamer","fa":"چکش","fi":"Vasara","fr":"Marteau","hr":"čekić","hu":"Kalapács","id":"Palu","it":"Martello","ja":"金槌","nb_NO":"Hammer","nl":"Hamer","pt":"Martelo","pt_BR":"Martelo","ru":"Молоток","si":null,"sk":"Kladivo","sq":"Çekiç","sr":"чекић","sv":"Hammare","szl":null,"tzm":null,"uk":"Молоток","vi":"Búa","zh_Hans":"锤子","zh_Hant":"鎚子"}},{"number":49,"emoji":"☎️","description":"Telephone","unicode":"U+260EU+FE0F","translated_descriptions":{"ar":"تِلِفُون","bg":"Телефон","ca":"Telèfon","cs":"Telefon","de":"Telefon","eo":"Telefono","es":"Teléfono","et":"Telefon","fa":"تلفن","fi":"Puhelin","fr":"Téléphone","hr":"telefon","hu":"Telefon","id":"Telepon","it":"Telefono","ja":"電話機","nb_NO":"Telefon","nl":"Telefoon","pt":"Telefone","pt_BR":"Telefone","ru":"Телефон","si":null,"sk":"Telefón","sq":"Telefon","sr":"телефон","sv":"Telefon","szl":null,"tzm":"Atilifun","uk":"Телефон","vi":"Điện thoại","zh_Hans":"电话","zh_Hant":"電話"}},{"number":50,"emoji":"🏁","description":"Flag","unicode":"U+1F3C1","translated_descriptions":{"ar":"عَلَم","bg":"Флаг","ca":"Bandera","cs":"Vlajka","de":"Flagge","eo":"Flago","es":"Bandera","et":"Lipp","fa":"پرچم","fi":"Lippu","fr":"Drapeau","hr":"zastava","hu":"Zászló","id":"Bendera","it":"Bandiera","ja":"旗","nb_NO":"Flagg","nl":"Vlag","pt":"Bandeira","pt_BR":"Bandeira","ru":"Флаг","si":null,"sk":"Zástava","sq":"Flamur","sr":"застава","sv":"Flagga","szl":null,"tzm":"Acenyal","uk":"Прапор","vi":"Lá cờ","zh_Hans":"旗帜","zh_Hant":"旗幟"}},{"number":51,"emoji":"🚂","description":"Train","unicode":"U+1F682","translated_descriptions":{"ar":"قِطَار","bg":"Влак","ca":"Tren","cs":"Vlak","de":"Zug","eo":"Vagonaro","es":"Tren","et":"Rong","fa":"قطار","fi":"Juna","fr":"Train","hr":"vlak","hu":"Vonat","id":"Kereta Api","it":"Treno","ja":"電車","nb_NO":"Tog","nl":"Trein","pt":"Comboio","pt_BR":"Trem","ru":"Поезд","si":null,"sk":"Vlak","sq":"Tren","sr":"воз","sv":"Tåg","szl":null,"tzm":null,"uk":"Потяг","vi":"Xe lửa","zh_Hans":"火车","zh_Hant":"火車"}},{"number":52,"emoji":"🚲","description":"Bicycle","unicode":"U+1F6B2","translated_descriptions":{"ar":"دَرّاجَة","bg":"Колело","ca":"Bicicleta","cs":"Kolo","de":"Fahrrad","eo":"Biciklo","es":"Bicicleta","et":"Jalgratas","fa":"دوچرخه","fi":"Polkupyörä","fr":"Vélo","hr":"bicikl","hu":"Kerékpár","id":"Sepeda","it":"Bicicletta","ja":"自転車","nb_NO":"Sykkel","nl":"Fiets","pt":"Bicicleta","pt_BR":"Bicicleta","ru":"Велосипед","si":null,"sk":"Bicykel","sq":"Biçikletë","sr":"бицикл","sv":"Cykel","szl":null,"tzm":null,"uk":"Велосипед","vi":"Xe đạp","zh_Hans":"自行车","zh_Hant":"腳踏車"}},{"number":53,"emoji":"✈️","description":"Aeroplane","unicode":"U+2708U+FE0F","translated_descriptions":{"ar":"طَائِرة","bg":"Самолет","ca":"Avió","cs":"Letadlo","de":"Flugzeug","eo":"Aviadilo","es":"Avión","et":"Lennuk","fa":"هواپیما","fi":"Lentokone","fr":"Avion","hr":"avion","hu":"Repülő","id":"Pesawat","it":"Aeroplano","ja":"飛行機","nb_NO":"Fly","nl":"Vliegtuig","pt":"Avião","pt_BR":"Avião","ru":"Самолет","si":null,"sk":"Lietadlo","sq":"Avion","sr":"авион","sv":"Flygplan","szl":null,"tzm":null,"uk":"Літак","vi":"Máy bay","zh_Hans":"飞机","zh_Hant":"飛機"}},{"number":54,"emoji":"🚀","description":"Rocket","unicode":"U+1F680","translated_descriptions":{"ar":"صَارُوخ","bg":"Ракета","ca":"Coet","cs":"Raketa","de":"Rakete","eo":"Raketo","es":"Cohete","et":"Rakett","fa":"موشک","fi":"Raketti","fr":"Fusée","hr":"raketa","hu":"Rakáta","id":"Roket","it":"Razzo","ja":"ロケット","nb_NO":"Rakett","nl":"Raket","pt":"Foguetão","pt_BR":"Foguete","ru":"Ракета","si":null,"sk":"Raketa","sq":"Raketë","sr":"ракета","sv":"Raket","szl":null,"tzm":null,"uk":"Ракета","vi":"Tên lửa","zh_Hans":"火箭","zh_Hant":"火箭"}},{"number":55,"emoji":"🏆","description":"Trophy","unicode":"U+1F3C6","translated_descriptions":{"ar":"كَأسُ النَّصر","bg":"Трофей","ca":"Trofeu","cs":"Pohár","de":"Pokal","eo":"Trofeo","es":"Trofeo","et":"Auhind","fa":"جام","fi":"Palkinto","fr":"Trophée","hr":"trofej","hu":"Trófea","id":"Piala","it":"Trofeo","ja":"トロフィー","nb_NO":"Pokal","nl":"Trofee","pt":"Troféu","pt_BR":"Troféu","ru":"Кубок","si":null,"sk":"Trofej","sq":"Trofe","sr":"пехар","sv":"Trofé","szl":null,"tzm":null,"uk":"Приз","vi":"Cúp","zh_Hans":"奖杯","zh_Hant":"獎盃"}},{"number":56,"emoji":"⚽","description":"Ball","unicode":"U+26BD","translated_descriptions":{"ar":"كُرَة","bg":"Топка","ca":"Pilota","cs":"Míč","de":"Ball","eo":"Pilko","es":"Bola","et":"Pall","fa":"توپ","fi":"Pallo","fr":"Ballon","hr":"lopta","hu":"Labda","id":"Bola","it":"Palla","ja":"ボール","nb_NO":"Ball","nl":"Bal","pt":"Bola","pt_BR":"Bola","ru":"Мяч","si":null,"sk":"Lopta","sq":"Top","sr":"лопта","sv":"Boll","szl":null,"tzm":"Tcama","uk":"М'яч","vi":"Banh","zh_Hans":"球","zh_Hant":"足球"}},{"number":57,"emoji":"🎸","description":"Guitar","unicode":"U+1F3B8","translated_descriptions":{"ar":"غيتار","bg":"Китара","ca":"Guitarra","cs":"Kytara","de":"Gitarre","eo":"Gitaro","es":"Guitarra","et":"Kitarr","fa":"گیتار","fi":"Kitara","fr":"Guitare","hr":"gitara","hu":"Gitár","id":"Gitar","it":"Chitarra","ja":"ギター","nb_NO":"Gitar","nl":"Gitaar","pt":"Guitarra","pt_BR":"Guitarra","ru":"Гитара","si":null,"sk":"Gitara","sq":"Kitarë","sr":"гитара","sv":"Gitarr","szl":null,"tzm":"Agiṭaṛ","uk":"Гітара","vi":"Ghi-ta","zh_Hans":"吉他","zh_Hant":"吉他"}},{"number":58,"emoji":"🎺","description":"Trumpet","unicode":"U+1F3BA","translated_descriptions":{"ar":"بُوق","bg":"Тромпет","ca":"Trompeta","cs":"Trumpeta","de":"Trompete","eo":"Trumpeto","es":"Trompeta","et":"Trompet","fa":"شیپور","fi":"Trumpetti","fr":"Trompette","hr":"truba","hu":"Trombita","id":"Terompet","it":"Trombetta","ja":"トランペット","nb_NO":"Trompet","nl":"Trompet","pt":"Trompete","pt_BR":"Trombeta","ru":"Труба","si":null,"sk":"Trúbka","sq":"Trombë","sr":"труба","sv":"Trumpet","szl":null,"tzm":null,"uk":"Труба","vi":"Kèn","zh_Hans":"喇叭","zh_Hant":"喇叭"}},{"number":59,"emoji":"🔔","description":"Bell","unicode":"U+1F514","translated_descriptions":{"ar":"جَرَس","bg":"Звънец","ca":"Campana","cs":"Zvonek","de":"Glocke","eo":"Sonorilo","es":"Campana","et":"Kelluke","fa":"زنگ","fi":"Soittokello","fr":"Cloche","hr":"zvono","hu":"Harang","id":"Lonceng","it":"Campana","ja":"ベル","nb_NO":"Bjelle","nl":"Bel","pt":"Sino","pt_BR":"Sino","ru":"Колокол","si":null,"sk":"Zvonec","sq":"Kambanë","sr":"звоно","sv":"Bjällra","szl":null,"tzm":null,"uk":"Дзвін","vi":"Chuông","zh_Hans":"铃铛","zh_Hant":"鈴鐺"}},{"number":60,"emoji":"⚓","description":"Anchor","unicode":"U+2693","translated_descriptions":{"ar":"مِرسَاة","bg":"Котва","ca":"Àncora","cs":"Kotva","de":"Anker","eo":"Ankro","es":"Ancla","et":"Ankur","fa":"لنگر","fi":"Ankkuri","fr":"Ancre","hr":"sidro","hu":"Horgony","id":"Jangkar","it":"Ancora","ja":"いかり","nb_NO":"Anker","nl":"Anker","pt":"Âncora","pt_BR":"Âncora","ru":"Якорь","si":null,"sk":"Kotva","sq":"Spirancë","sr":"сидро","sv":"Ankare","szl":null,"tzm":null,"uk":"Якір","vi":"Mỏ neo","zh_Hans":"锚","zh_Hant":"船錨"}},{"number":61,"emoji":"🎧","description":"Headphones","unicode":"U+1F3A7","translated_descriptions":{"ar":"سَمّاعَة رَأس","bg":"Слушалки","ca":"Auriculars","cs":"Sluchátka","de":"Kopfhörer","eo":"Kapaŭdilo","es":"Cascos","et":"Kõrvaklapid","fa":"هدفون","fi":"Kuulokkeet","fr":"Casque audio","hr":"slušalice","hu":"Fejhallgató","id":"Headphone","it":"Cuffie","ja":"ヘッドホン","nb_NO":"Hodetelefoner","nl":"Koptelefoon","pt":"Fones","pt_BR":"Fones de ouvido","ru":"Наушники","si":null,"sk":"Slúchadlá","sq":"Kufje","sr":"слушалице","sv":"Hörlurar","szl":null,"tzm":null,"uk":"Навушники","vi":"Tai nghe","zh_Hans":"耳机","zh_Hant":"耳機"}},{"number":62,"emoji":"📁","description":"Folder","unicode":"U+1F4C1","translated_descriptions":{"ar":"مُجَلَّد","bg":"Папка","ca":"Carpeta","cs":"Složka","de":"Ordner","eo":"Dosierujo","es":"Carpeta","et":"Kaust","fa":"پوشه","fi":"Kansio","fr":"Dossier","hr":"mapu","hu":"Mappa","id":"Map","it":"Cartella","ja":"フォルダー","nb_NO":"Mappe","nl":"Map","pt":"Pasta","pt_BR":"Pasta","ru":"Папка","si":null,"sk":"Fascikel","sq":"Dosje","sr":"фасцикла","sv":"Mapp","szl":null,"tzm":"Asdaw","uk":"Тека","vi":"Thư mục","zh_Hans":"文件夹","zh_Hant":"資料夾"}},{"number":63,"emoji":"📌","description":"Pin","unicode":"U+1F4CC","translated_descriptions":{"ar":"دَبُّوس","bg":"Кабърче","ca":"Xinxeta","cs":"Špendlík","de":"Stecknadel","eo":"Pinglo","es":"Alfiler","et":"Nööpnõel","fa":"سنجاق","fi":"Nuppineula","fr":"Punaise","hr":"pribadača","hu":"Rajszeg","id":"Pin","it":"Puntina","ja":"ピン","nb_NO":"Tegnestift","nl":"Duimspijker","pt":"Pionés","pt_BR":"Alfinete","ru":"Булавка","si":null,"sk":"Špendlík","sq":"Karficë","sr":"чиода","sv":"Häftstift","szl":null,"tzm":null,"uk":"Кнопка","vi":"Ghim","zh_Hans":"图钉","zh_Hant":"圖釘"}}]`), w3 = new Map(
  _3.map(({ emoji: e, description: t, translated_descriptions: n }) => [
    e,
    [
      t,
      // Normalize the translation keys
      Object.keys(n).reduce((r, o) => {
        for (const i of v1(o))
          r[i] = n[o];
        return r;
      }, {})
    ]
  ])
);
function E3(e, t) {
  const n = w3.get(e);
  if (!n)
    throw new Error(`Emoji mapping not found for emoji ${e}`);
  const [r, o] = n;
  for (const i of v1(t))
    if (o[i])
      return o[i];
  return r;
}
const S3 = "_container_1lqqy_8", T3 = "_segment_1lqqy_15", A3 = "_emoji_1lqqy_23", I3 = "_label_1lqqy_29", Jr = {
  container: S3,
  segment: T3,
  emoji: A3,
  label: I3
};
function D8({ emoji: e, className: t }) {
  const { language: n } = Pe(), r = e.map((o, i) => /* @__PURE__ */ p.createElement("div", { className: Jr.segment, key: i }, /* @__PURE__ */ p.createElement("div", { className: Jr.emoji, "aria-hidden": !0 }, o), /* @__PURE__ */ p.createElement("div", { className: Jr.label }, E3(o, n))));
  return /* @__PURE__ */ p.createElement("div", { className: _e(Jr.container, t) }, r);
}
const O3 = "_container_sq5fu_8", j3 = "_title_sq5fu_34", P3 = "_subtitle_sq5fu_35", Ma = {
  container: O3,
  title: j3,
  subtitle: P3
};
function L8({
  icon: e,
  title: t,
  subtitle: n,
  className: r,
  children: o,
  ref: i
}) {
  return /* @__PURE__ */ p.createElement("div", { className: _e(Ma.container, r), ref: i }, e, /* @__PURE__ */ p.createElement("div", { className: Ma.title }, t), n && /* @__PURE__ */ p.createElement("div", { className: Ma.subtitle }, n), o);
}
function q8({ vm: e }) {
  const t = ve(e);
  return /* @__PURE__ */ p.createElement("div", { className: "mx_TextualEvent" }, t.content);
}
function C1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 4.5a1 1 0 0 1 1 1v10.586l4.293-4.293a1 1 0 0 1 1.414 1.414l-6 6a1 1 0 0 1-1.414 0l-6-6a1 1 0 1 1 1.414-1.414L11 16.086V5.5a1 1 0 0 1 1-1"
    })
  });
}
C1.displayName = "ArrowDownIcon";
const k3 = U(C1);
function x1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 22a9.7 9.7 0 0 1-3.9-.788 10.1 10.1 0 0 1-3.175-2.137q-1.35-1.35-2.137-3.175A9.7 9.7 0 0 1 2 12q0-2.075.788-3.9a10.1 10.1 0 0 1 2.137-3.175q1.35-1.35 3.175-2.137A9.7 9.7 0 0 1 12 2q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 22 12a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 12 22m0-2q3.35 0 5.675-2.325T20 12q0-1.35-.437-2.6A8 8 0 0 0 18.3 7.1L7.1 18.3q1.05.825 2.3 1.262T12 20m-6.3-3.1L16.9 5.7a8 8 0 0 0-2.3-1.263A7.8 7.8 0 0 0 12 4Q8.65 4 6.325 6.325T4 12q0 1.35.438 2.6A8 8 0 0 0 5.7 16.9"
    })
  });
}
x1.displayName = "BlockIcon";
const wf = U(x1);
function N1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m1.5 21.25 1.45-4.95a10.2 10.2 0 0 1-.712-2.1A10.2 10.2 0 0 1 2 12q0-2.075.788-3.9a10.1 10.1 0 0 1 2.137-3.175q1.35-1.35 3.175-2.137A9.7 9.7 0 0 1 12 2q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 22 12a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 12 22q-1.125 0-2.2-.238a10.2 10.2 0 0 1-2.1-.712L2.75 22.5a.94.94 0 0 1-1-.25.94.94 0 0 1-.25-1m2.45-1.2 3.2-.95a1 1 0 0 1 .275-.062q.15-.013.275-.013.225 0 .438.038.212.036.412.137a7.4 7.4 0 0 0 1.675.6Q11.1 20 12 20q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4 6.325 6.325 4 12q0 .9.2 1.775t.6 1.675q.176.325.188.688t-.088.712z"
    })
  });
}
N1.displayName = "ChatIcon";
const z1 = U(N1);
function B1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M9.55 17.575q-.2 0-.375-.062a.9.9 0 0 1-.325-.213L4.55 13q-.274-.274-.262-.713.012-.437.287-.712a.95.95 0 0 1 .7-.275q.425 0 .7.275L9.55 15.15l8.475-8.475q.274-.275.713-.275.437 0 .712.275.275.274.275.713 0 .437-.275.712l-9.2 9.2q-.15.15-.325.212a1.1 1.1 0 0 1-.375.063"
    })
  });
}
B1.displayName = "CheckIcon";
const F1 = U(B1);
function D1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 14.95q-.2 0-.375-.062a.9.9 0 0 1-.325-.213l-4.6-4.6a.95.95 0 0 1-.275-.7q0-.425.275-.7a.95.95 0 0 1 .7-.275q.425 0 .7.275l3.9 3.9 3.9-3.9a.95.95 0 0 1 .7-.275q.425 0 .7.275a.95.95 0 0 1 .275.7.95.95 0 0 1-.275.7l-4.6 4.6q-.15.15-.325.212a1.1 1.1 0 0 1-.375.063"
    })
  });
}
D1.displayName = "ChevronDownIcon";
const L1 = U(D1);
function q1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M6.293 6.293a1 1 0 0 1 1.414 0L12 10.586l4.293-4.293a1 1 0 1 1 1.414 1.414L13.414 12l4.293 4.293a1 1 0 0 1-1.414 1.414L12 13.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L10.586 12 6.293 7.707a1 1 0 0 1 0-1.414"
    })
  });
}
q1.displayName = "CloseIcon";
const R3 = U(q1);
function H1(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      fillRule: "evenodd",
      d: "M16.937 2.82a2 2 0 0 1 2.828 0l1.415 1.414a2 2 0 0 1 0 2.829l-7.071 7.07c-.195.196-.42.342-.66.44a1 1 0 0 1-.168.072l-3.993 1.331a1 1 0 0 1-1.265-1.265l1.331-3.992q.03-.09.073-.168m10.338-4.903-6.717 6.718-1.414-1.414 6.717-6.718z",
      clipRule: "evenodd"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M3 5a2 2 0 0 1 2-2h6a1 1 0 1 1 0 2H5v14h14v-6a1 1 0 1 1 2 0v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    })]
  });
}
H1.displayName = "ComposeIcon";
const U1 = U(H1);
function $1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M7 21q-.824 0-1.412-.587A1.93 1.93 0 0 1 5 19V6a.97.97 0 0 1-.713-.287A.97.97 0 0 1 4 5q0-.424.287-.713A.97.97 0 0 1 5 4h4q0-.424.287-.712A.97.97 0 0 1 10 3h4q.424 0 .713.288Q15 3.575 15 4h4q.424 0 .712.287Q20 4.576 20 5t-.288.713A.97.97 0 0 1 19 6v13q0 .824-.587 1.413A1.93 1.93 0 0 1 17 21zM7 6v13h10V6zm2 10q0 .424.287.712Q9.576 17 10 17t.713-.288A.97.97 0 0 0 11 16V9a.97.97 0 0 0-.287-.713A.97.97 0 0 0 10 8a.97.97 0 0 0-.713.287A.97.97 0 0 0 9 9zm4 0q0 .424.287.712.288.288.713.288.424 0 .713-.288A.97.97 0 0 0 15 16V9a.97.97 0 0 0-.287-.713A.97.97 0 0 0 14 8a.97.97 0 0 0-.713.287A.97.97 0 0 0 13 9z"
    })
  });
}
$1.displayName = "DeleteIcon";
const M3 = U($1);
function K1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 18.6c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8M6.6 2.4c-.99 0-1.8.81-1.8 1.8S5.61 6 6.6 6s1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m0 5.4c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m0 5.4c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8M17.4 6c.99 0 1.8-.81 1.8-1.8s-.81-1.8-1.8-1.8-1.8.81-1.8 1.8.81 1.8 1.8 1.8M12 13.2c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m5.4 0c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m0-5.4c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m-5.4 0c-.99 0-1.8.81-1.8 1.8s.81 1.8 1.8 1.8 1.8-.81 1.8-1.8-.81-1.8-1.8-1.8m0-5.4c-.99 0-1.8.81-1.8 1.8S11.01 6 12 6s1.8-.81 1.8-1.8-.81-1.8-1.8-1.8"
    })
  });
}
K1.displayName = "DialPadIcon";
const C3 = U(K1);
function G1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 5.111a1 1 0 0 0 .514.874l7 3.89a1 1 0 0 0 .972 0l7-3.89a1 1 0 1 0-.972-1.748L12 11.856 5.486 8.237A1 1 0 0 0 4 9.111"
    })
  });
}
G1.displayName = "EmailSolidIcon";
const x3 = U(G1);
function V1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 13a.97.97 0 0 1-.713-.287A.97.97 0 0 1 11 12q0-.424.287-.713A.97.97 0 0 1 12 11q.424 0 .713.287.287.288.287.713 0 .424-.287.713A.97.97 0 0 1 12 13m0 9a9.7 9.7 0 0 1-3.9-.788 10.1 10.1 0 0 1-3.175-2.137q-1.35-1.35-2.137-3.175A9.7 9.7 0 0 1 2 12q0-2.075.788-3.9a10.1 10.1 0 0 1 2.137-3.175q1.35-1.35 3.175-2.137A9.7 9.7 0 0 1 12 2q2.075 0 3.9.788a10.1 10.1 0 0 1 3.175 2.137q1.35 1.35 2.137 3.175A9.7 9.7 0 0 1 22 12a9.7 9.7 0 0 1-.788 3.9 10.1 10.1 0 0 1-2.137 3.175q-1.35 1.35-3.175 2.137A9.7 9.7 0 0 1 12 22m0-2q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4 6.325 6.325 4 12t2.325 5.675T12 20m0 0q-3.35 0-5.675-2.325T4 12t2.325-5.675T12 4t5.675 2.325T20 12t-2.325 5.675T12 20m1.675-5.85q.15-.075.275-.2t.2-.275l2.925-6.25q.125-.25-.062-.437-.188-.188-.438-.063l-6.25 2.925q-.15.075-.275.2t-.2.275l-2.925 6.25q-.125.25.063.438.186.186.437.062z"
    })
  });
}
V1.displayName = "ExploreIcon";
const N3 = U(V1);
function Y1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M13.905 9.378 12 5.52l-1.905 3.86-4.259.618 3.082 3.004-.727 4.242L12 15.24l3.81 2.003-.728-4.242 3.082-3.004zM8.767 7.55l2.336-4.733a1 1 0 0 1 1.794 0l2.336 4.733 5.223.76a1 1 0 0 1 .555 1.705L17.23 13.7l.892 5.202a1 1 0 0 1-1.45 1.054L12 17.5l-4.672 2.456a1 1 0 0 1-1.451-1.054l.892-5.202-3.78-3.685a1 1 0 0 1 .555-1.706z"
    })
  });
}
Y1.displayName = "FavouriteIcon";
const z3 = U(Y1);
function W1(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M18.93 8A8 8 0 1 1 4 12a1 1 0 1 0-2 0c0 5.523 4.477 10 10 10s10-4.477 10-10a10 10 0 0 0-.832-4A10 10 0 0 0 12 2a9.99 9.99 0 0 0-8 3.999V4a1 1 0 0 0-2 0v4a1 1 0 0 0 1 1h4a1 1 0 0 0 0-2H5.755A7.99 7.99 0 0 1 12 4a8 8 0 0 1 6.93 4"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M13 8a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.83 2.83a1 1 0 0 0 1.414-1.414L13 11.586z"
    })]
  });
}
W1.displayName = "HistoryIcon";
const B3 = U(W1);
function Z1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      fillRule: "evenodd",
      d: "M16 11v8h3V9.177l-7-3.889-7 3.889V19h3v-8zm-6 10H5a2 2 0 0 1-2-2V9.177a2 2 0 0 1 1.029-1.748l7-3.89a2 2 0 0 1 1.942 0l7 3.89A2 2 0 0 1 21 9.177V19a2 2 0 0 1-2 2h-5v-8h-4z",
      clipRule: "evenodd"
    })
  });
}
Z1.displayName = "HomeIcon";
const F3 = U(Z1);
function J1(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M14 13q.424 0 .713-.287A.97.97 0 0 0 15 12a.97.97 0 0 0-.287-.713A.97.97 0 0 0 14 11a.97.97 0 0 0-.713.287A.97.97 0 0 0 13 12q0 .424.287.713.288.287.713.287"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M10.385 21.788A1 1 0 0 1 10 21V3a1.003 1.003 0 0 1 1.242-.97l8 2A1 1 0 0 1 20 5v14a1 1 0 0 1-.758.97l-8 2a1 1 0 0 1-.857-.182M18 5.781l-6-1.5v15.438l6-1.5zM9 6H7v12h2v2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2z"
    })]
  });
}
J1.displayName = "LeaveIcon";
const D3 = U(J1);
function X1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 19.071q-1.467 1.467-3.536 1.467-2.067 0-3.535-1.467t-1.467-3.535q0-2.07 1.467-3.536L7.05 9.879q.3-.3.707-.3t.707.3.301.707-.3.707l-2.122 2.121a2.9 2.9 0 0 0-.884 2.122q0 1.237.884 2.12.884.885 2.121.885t2.122-.884l2.121-2.121q.3-.3.707-.3t.707.3.3.707q0 .405-.3.707zm-1.414-4.243q-.3.3-.707.301a.97.97 0 0 1-.707-.3q-.3-.3-.301-.708 0-.405.3-.707l4.243-4.242q.3-.3.707-.3t.707.3.3.707-.3.707zm6.364-.707q-.3.3-.707.3a.97.97 0 0 1-.707-.3q-.3-.3-.301-.707 0-.405.3-.707l2.122-2.121q.884-.885.884-2.121 0-1.238-.884-2.122a2.9 2.9 0 0 0-2.121-.884q-1.237 0-2.122.884l-2.121 2.122q-.3.3-.707.3a.97.97 0 0 1-.707-.3q-.3-.3-.3-.708 0-.405.3-.707L12 4.93q1.467-1.467 3.536-1.467t3.535 1.467 1.467 3.536T19.071 12z"
    })
  });
}
X1.displayName = "LinkIcon";
const L3 = U(X1);
function Q1(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M21.324 9.13c0-.66-.339-1.237-.862-1.558l-7.37-4.318a1.81 1.81 0 0 0-1.851 0L3.87 7.572C3.348 7.892 3 8.47 3 9.13v9.167c0 1.008.825 1.833 1.833 1.833H19.5a1.84 1.84 0 0 0 1.833-1.833zm-10.129 3.978-6.6-4.124 6.646-3.896a1.81 1.81 0 0 1 1.851 0l6.646 3.896-6.6 4.124a1.85 1.85 0 0 1-1.943 0"
    })
  });
}
Q1.displayName = "MarkAsReadIcon";
const q3 = U(Q1);
function eh(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M20 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4"
    }), /* @__PURE__ */ R.jsx("path", {
      fillRule: "evenodd",
      d: "M17 5H5a2 2 0 0 0-2 2v10.4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7.83a3 3 0 0 1-2 0q-.316-.113-.595-.288L12 11.89 5 7.138V7h12.764A3 3 0 0 1 17 5m-4.438 8.927L19 9.555V17.4H5V9.555l6.438 4.372a1 1 0 0 0 1.124 0",
      clipRule: "evenodd"
    })]
  });
}
eh.displayName = "MarkAsUnreadIcon";
const H3 = U(eh);
function th(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M12 4a8 8 0 1 0 0 16 1 1 0 1 1 0 2C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10v1.5a3.5 3.5 0 0 1-6.396 1.966A5 5 0 1 1 17 12v1.5a1.5 1.5 0 0 0 3 0V12a8 8 0 0 0-8-8m3 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0"
    })
  });
}
th.displayName = "MentionIcon";
const U3 = U(th);
function nh(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "m4.917 2.083 17 17a1 1 0 0 1-1.414 1.414L19.006 19H4.414c-.89 0-1.337-1.077-.707-1.707L5 16v-6s0-2.034 1.096-3.91L3.504 3.498a1 1 0 0 1 1.414-1.414M19 13.35 9.136 3.484C9.93 3.181 10.874 3 12 3c7 0 7 7 7 7z"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M10 20h4a2 2 0 0 1-4 0"
    })]
  });
}
nh.displayName = "NotificationsOffSolidIcon";
const rh = U(nh);
function oh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M20.293 17.293c.63.63.184 1.707-.707 1.707H4.414c-.89 0-1.337-1.077-.707-1.707L5 16v-6s0-7 7-7 7 7 7 7v6zM12 22a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2"
    })
  });
}
oh.displayName = "NotificationsSolidIcon";
const $3 = U(oh);
function ih(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M6 14q-.824 0-1.412-.588A1.93 1.93 0 0 1 4 12q0-.825.588-1.412A1.93 1.93 0 0 1 6 10q.824 0 1.412.588Q8 11.175 8 12t-.588 1.412A1.93 1.93 0 0 1 6 14m6 0q-.825 0-1.412-.588A1.93 1.93 0 0 1 10 12q0-.825.588-1.412A1.93 1.93 0 0 1 12 10q.825 0 1.412.588Q14 11.175 14 12t-.588 1.412A1.93 1.93 0 0 1 12 14m6 0q-.824 0-1.413-.588A1.93 1.93 0 0 1 16 12q0-.825.587-1.412A1.93 1.93 0 0 1 18 10q.824 0 1.413.588Q20 11.175 20 12t-.587 1.412A1.93 1.93 0 0 1 18 14"
    })
  });
}
ih.displayName = "OverflowHorizontalIcon";
const zc = U(ih);
function ah(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      fillRule: "evenodd",
      d: "M6.5 2h11a4.5 4.5 0 1 1 0 9h-11a4.5 4.5 0 0 1 0-9m0 2h7.258A4.5 4.5 0 0 0 13 6.5c0 .925.28 1.785.758 2.5H6.5a2.5 2.5 0 0 1 0-5M15 6.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0m-13 11A4.5 4.5 0 0 1 6.5 13h11a4.5 4.5 0 1 1 0 9h-11q-.233 0-.46-.023A4.5 4.5 0 0 1 2 17.5m8.242-2.5H17.5a2.5 2.5 0 0 1 0 5h-7.258A4.5 4.5 0 0 0 11 17.5c0-.925-.28-1.785-.758-2.5M6.5 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
      clipRule: "evenodd"
    })
  });
}
ah.displayName = "PreferencesIcon";
const K3 = U(ah);
function sh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M18.93 8A8 8 0 1 1 4 12a1 1 0 1 0-2 0c0 5.523 4.477 10 10 10s10-4.477 10-10a10 10 0 0 0-.832-4A10 10 0 0 0 12 2a9.99 9.99 0 0 0-8 3.999V4a1 1 0 0 0-2 0v4a1 1 0 0 0 1 1h4a1 1 0 0 0 0-2H5.755A7.99 7.99 0 0 1 12 4a8 8 0 0 1 6.93 4"
    })
  });
}
sh.displayName = "RestartIcon";
const Ef = U(sh);
function ch(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m8.566 17-.944 4.094q-.086.406-.372.656t-.687.25q-.543 0-.887-.469a1.18 1.18 0 0 1-.2-1.031l.801-3.5H3.158q-.572 0-.916-.484a1.27 1.27 0 0 1-.2-1.078 1.12 1.12 0 0 1 1.116-.938H6.85l1.145-5h-3.12q-.57 0-.915-.484a1.27 1.27 0 0 1-.2-1.078A1.12 1.12 0 0 1 4.875 7h3.691l.945-4.094q.085-.406.372-.656.286-.25.686-.25.544 0 .887.469.345.468.2 1.031l-.8 3.5h4.578l.944-4.094q.085-.406.372-.656.286-.25.687-.25.543 0 .887.469t.2 1.031L17.723 7h3.119q.573 0 .916.484.343.485.2 1.079a1.12 1.12 0 0 1-1.116.937H17.15l-1.145 5h3.12q.57 0 .915.484.343.485.2 1.079a1.12 1.12 0 0 1-1.116.937h-3.691l-.944 4.094q-.087.406-.373.656t-.686.25q-.544 0-.887-.469a1.18 1.18 0 0 1-.2-1.031l.8-3.5zm.573-2.5h4.578l1.144-5h-4.578z"
    })
  });
}
ch.displayName = "RoomIcon";
const lh = U(ch);
function uh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M15.05 16.463a7.5 7.5 0 1 1 1.414-1.414l3.243 3.244a1 1 0 0 1-1.414 1.414zM16 10.5a5.5 5.5 0 1 0-11 0 5.5 5.5 0 0 0 11 0"
    })
  });
}
uh.displayName = "SearchIcon";
const G3 = U(uh);
function fh(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0m-2 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M11.312 2h1.376A2.31 2.31 0 0 1 15 4.312v.247l.002.003c.01.014.031.033.064.047.03.013.056.013.07.01h.002l.177-.177a2.31 2.31 0 0 1 3.27 0l.973.974a2.31 2.31 0 0 1 0 3.269l-.177.177v.003a.13.13 0 0 0 .01.07.15.15 0 0 0 .047.063l.003.002h.247A2.31 2.31 0 0 1 22 11.312v1.376A2.31 2.31 0 0 1 19.688 15h-.247l-.003.002a.15.15 0 0 0-.047.064.13.13 0 0 0-.01.07v.002l.177.177a2.31 2.31 0 0 1 0 3.27l-.974.973a2.31 2.31 0 0 1-3.269 0l-.177-.177h-.003a.13.13 0 0 0-.07.01.15.15 0 0 0-.063.047l-.002.003v.247A2.31 2.31 0 0 1 12.688 22h-1.376A2.31 2.31 0 0 1 9 19.688v-.247l-.002-.003a.15.15 0 0 0-.064-.047.13.13 0 0 0-.07-.01h-.002l-.177.177a2.31 2.31 0 0 1-3.27 0l-.973-.974a2.31 2.31 0 0 1 0-3.269l.177-.177v-.003a.14.14 0 0 0-.01-.07.15.15 0 0 0-.047-.063L4.559 15h-.247A2.31 2.31 0 0 1 2 12.688v-1.376A2.31 2.31 0 0 1 4.312 9h.247l.003-.002a.15.15 0 0 0 .047-.064.14.14 0 0 0 .01-.07v-.002l-.177-.177a2.31 2.31 0 0 1 0-3.27l.974-.973a2.31 2.31 0 0 1 3.269 0l.177.177h.003a.14.14 0 0 0 .07-.01.15.15 0 0 0 .063-.047L9 4.559v-.247A2.31 2.31 0 0 1 11.312 2M11 4.312v.257c0 .893-.59 1.593-1.299 1.887-.716.297-1.622.21-2.248-.418l-.182-.182a.31.31 0 0 0-.441 0l-.974.974a.31.31 0 0 0 0 .44l.182.183c.627.626.715 1.531.418 2.248C6.162 10.41 5.462 11 4.569 11h-.257a.31.31 0 0 0-.312.312v1.376c0 .172.14.312.312.312h.257c.893 0 1.593.59 1.887 1.299.297.716.21 1.622-.418 2.248l-.182.182a.31.31 0 0 0 0 .441l.974.973a.31.31 0 0 0 .44 0l.183-.181c.626-.627 1.532-.715 2.248-.418.709.294 1.299.994 1.299 1.887v.257c0 .172.14.312.312.312h1.376c.172 0 .312-.14.312-.312v-.257c0-.893.59-1.593 1.299-1.887.716-.297 1.622-.21 2.249.418l.181.181c.122.122.32.122.441 0l.973-.973a.31.31 0 0 0 0-.44l-.181-.183c-.627-.626-.715-1.532-.418-2.248.294-.709.994-1.299 1.887-1.299h.257c.172 0 .312-.14.312-.312v-1.376a.31.31 0 0 0-.312-.312h-.257c-.893 0-1.593-.59-1.887-1.299-.297-.717-.21-1.622.418-2.248l.181-.182a.31.31 0 0 0 0-.441l-.973-.974a.31.31 0 0 0-.44 0l-.183.182c-.626.627-1.532.715-2.248.418C13.59 6.162 13 5.462 13 4.569v-.257A.31.31 0 0 0 12.688 4h-1.376a.31.31 0 0 0-.312.312"
    })]
  });
}
fh.displayName = "SettingsIcon";
const V3 = U(fh);
function dh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M10 12q-1.65 0-2.825-1.175T6 8t1.175-2.825T10 4t2.825 1.175T14 8t-1.175 2.825T10 12m-8 6v-.8q0-.85.438-1.562.437-.713 1.162-1.088a14.8 14.8 0 0 1 3.15-1.163A13.8 13.8 0 0 1 10 13q1.65 0 3.25.387 1.6.388 3.15 1.163.724.375 1.163 1.087Q18 16.35 18 17.2v.8q0 .824-.587 1.413A1.93 1.93 0 0 1 16 20H4q-.824 0-1.412-.587A1.93 1.93 0 0 1 2 18m2 0h12v-.8a.97.97 0 0 0-.5-.85q-1.35-.675-2.725-1.012a11.6 11.6 0 0 0-5.55 0Q5.85 15.675 4.5 16.35a.97.97 0 0 0-.5.85zm6-8q.825 0 1.412-.588Q12 8.826 12 8q0-.824-.588-1.412A1.93 1.93 0 0 0 10 6q-.825 0-1.412.588A1.93 1.93 0 0 0 8 8q0 .825.588 1.412Q9.175 10 10 10m7 1h2v2q0 .424.288.713.287.287.712.287.424 0 .712-.287A.97.97 0 0 0 21 13v-2h2q.424 0 .712-.287A.97.97 0 0 0 24 10a.97.97 0 0 0-.288-.713A.97.97 0 0 0 23 9h-2V7a.97.97 0 0 0-.288-.713A.97.97 0 0 0 20 6a.97.97 0 0 0-.712.287A.97.97 0 0 0 19 7v2h-2a.97.97 0 0 0-.712.287A.97.97 0 0 0 16 10q0 .424.288.713.287.287.712.287"
    })
  });
}
dh.displayName = "UserAddIcon";
const ph = U(dh);
function hh(e, t) {
  return /* @__PURE__ */ R.jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: [/* @__PURE__ */ R.jsx("path", {
      d: "M12 15q-1.65 0-2.825-1.175T8 11t1.175-2.825T12 7t2.825 1.175T16 11t-1.175 2.825T12 15"
    }), /* @__PURE__ */ R.jsx("path", {
      d: "M19.528 18.583A9.96 9.96 0 0 0 22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 2.52.933 4.824 2.472 6.583A9.98 9.98 0 0 0 12 22a9.98 9.98 0 0 0 7.528-3.417M8.75 16.388q-1.373.332-2.709.95a8 8 0 1 1 11.918 0 14.7 14.7 0 0 0-2.709-.95A13.8 13.8 0 0 0 12 16q-1.65 0-3.25.387"
    })]
  });
}
hh.displayName = "UserProfileSolidIcon";
const Y3 = U(hh);
function mh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M6 4h10a2 2 0 0 1 2 2v4.286l3.35-2.871a1 1 0 0 1 1.65.76v7.65a1 1 0 0 1-1.65.76L18 13.715V18a2 2 0 0 1-2 2H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4"
    })
  });
}
mh.displayName = "VideoCallSolidIcon";
const W3 = U(mh);
function gh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "M2 8a4 4 0 0 1 4-4h10a2 2 0 0 1 2 2v4.286l3.35-2.871a1 1 0 0 1 1.65.76v7.65a1 1 0 0 1-1.65.76L18 13.715V18a2 2 0 0 1-2 2H6a4 4 0 0 1-4-4zm4-2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10V6zm15 7.652v-3.303L19.073 12z"
    })
  });
}
gh.displayName = "VideoCallIcon";
const Z3 = U(gh);
function yh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m16.1 13.3-1.45-1.45q.225-1.175-.675-2.2t-2.325-.8L10.2 7.4q.424-.2.863-.3A4.2 4.2 0 0 1 12 7q1.875 0 3.188 1.312Q16.5 9.625 16.5 11.5q0 .5-.1.938t-.3.862m3.2 3.15-1.45-1.4a11 11 0 0 0 1.688-1.588A9 9 0 0 0 20.8 11.5q-1.25-2.524-3.588-4.013Q14.875 6 12 6q-.724 0-1.425.1a10 10 0 0 0-1.375.3L7.65 4.85A11.1 11.1 0 0 1 12 4q3.575 0 6.425 1.887T22.7 10.8a.8.8 0 0 1 .1.313q.025.188.025.387a2 2 0 0 1-.125.7 10.9 10.9 0 0 1-3.4 4.25m-.2 5.45-3.5-3.45q-.874.274-1.762.413Q12.95 19 12 19q-3.575 0-6.425-1.887T1.3 12.2a.8.8 0 0 1-.1-.312 3 3 0 0 1 0-.763.8.8 0 0 1 .1-.3Q1.825 9.7 2.55 8.75A13.3 13.3 0 0 1 4.15 7L2.075 4.9a.93.93 0 0 1-.275-.688q0-.412.3-.712a.95.95 0 0 1 .7-.275q.425 0 .7.275l17 17q.275.275.288.688a.93.93 0 0 1-.288.712.95.95 0 0 1-.7.275.95.95 0 0 1-.7-.275M5.55 8.4q-.725.65-1.325 1.425A9 9 0 0 0 3.2 11.5q1.25 2.524 3.588 4.012T12 17q.5 0 .975-.062.475-.063.975-.138l-.9-.95q-.274.075-.525.113A3.5 3.5 0 0 1 12 16q-1.875 0-3.187-1.312Q7.5 13.375 7.5 11.5q0-.274.038-.525.037-.25.112-.525z"
    })
  });
}
yh.displayName = "VisibilityOffIcon";
const J3 = U(yh);
function vh(e, t) {
  return /* @__PURE__ */ R.jsx("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: "1em",
    height: "1em",
    fill: "currentColor",
    viewBox: "0 0 24 24",
    ref: t,
    ...e,
    children: /* @__PURE__ */ R.jsx("path", {
      d: "m20.958 16.374.039 3.527q0 .427-.33.756-.33.33-.756.33a16 16 0 0 1-6.57-1.105 16.2 16.2 0 0 1-5.563-3.663 16.1 16.1 0 0 1-3.653-5.573 16.3 16.3 0 0 1-1.115-6.56q0-.427.33-.757T4.095 3l3.528.039a1.07 1.07 0 0 1 1.085.93l.543 3.954q.039.271-.039.504a1.1 1.1 0 0 1-.271.426l-1.64 1.64q.505 1.008 1.154 1.909c.433.6 1.444 1.696 1.444 1.696s1.095 1.01 1.696 1.444q.9.65 1.909 1.153l1.64-1.64q.193-.193.426-.27t.504-.04l3.954.543q.406.059.668.359t.262.727"
    })
  });
}
vh.displayName = "VoiceCallSolidIcon";
const X3 = U(vh), Q3 = "_content_1uqu1_8", eE = "_error_1uqu1_14", tE = "_icon_1uqu1_23", So = {
  content: Q3,
  error: eE,
  icon: tE
};
var nE = /* @__PURE__ */ ((e) => (e.MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE = "MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE", e.HISTORICAL_MESSAGE_NO_KEY_BACKUP = "HISTORICAL_MESSAGE_NO_KEY_BACKUP", e.HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED = "HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED", e.HISTORICAL_MESSAGE_USER_NOT_JOINED = "HISTORICAL_MESSAGE_USER_NOT_JOINED", e.SENDER_IDENTITY_PREVIOUSLY_VERIFIED = "SENDER_IDENTITY_PREVIOUSLY_VERIFIED", e.UNSIGNED_SENDER_DEVICE = "UNSIGNED_SENDER_DEVICE", e.UNABLE_TO_DECRYPT = "UNABLE_TO_DECRYPT", e))(nE || {});
function rE(e, t, n) {
  const r = e.translate;
  switch (t) {
    case "MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE":
      return r("timeline|decryption_failure|blocked");
    case "HISTORICAL_MESSAGE_NO_KEY_BACKUP":
      return r("timeline|decryption_failure|historical_event_no_key_backup");
    case "HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED":
      if (n === !1)
        return r("timeline|decryption_failure|historical_event_unverified_device");
      break;
    case "HISTORICAL_MESSAGE_USER_NOT_JOINED":
      return r("timeline|decryption_failure|historical_event_user_not_joined");
    case "SENDER_IDENTITY_PREVIOUSLY_VERIFIED":
      return /* @__PURE__ */ p.createElement("span", null, /* @__PURE__ */ p.createElement(wf, { className: So.icon, width: "16px", height: "16px" }), r("timeline|decryption_failure|sender_identity_previously_verified"));
    case "UNSIGNED_SENDER_DEVICE":
      return /* @__PURE__ */ p.createElement("span", null, /* @__PURE__ */ p.createElement(wf, { className: So.icon, width: "16px", height: "16px" }), r("timeline|decryption_failure|sender_unsigned_device"));
  }
  return r("timeline|decryption_failure|unable_to_decrypt");
}
function oE(e) {
  switch (e) {
    case "SENDER_IDENTITY_PREVIOUSLY_VERIFIED":
    case "UNSIGNED_SENDER_DEVICE":
      return So.error;
  }
  return null;
}
function H8({ vm: e, ref: t }) {
  const n = Pe(), { decryptionFailureReason: r, isLocalDeviceVerified: o, extraClassNames: i } = ve(e), a = _e(So.content, oE(r), i);
  return /* @__PURE__ */ p.createElement("div", { className: a, ref: t }, rE(n, r, o));
}
function U8({
  vm: e,
  children: t
}) {
  const { formattedSenders: n, caption: r, tooltipOpen: o } = ve(e);
  return n ? /* @__PURE__ */ p.createElement(Ih, { description: n, caption: r, placement: "right", open: o }, t) : /* @__PURE__ */ p.createElement(p.Fragment, null, t);
}
const iE = "_timelineSeparator_yq5ye_8", aE = {
  timelineSeparator: iE
}, $8 = ({ label: e, className: t, children: n }) => /* @__PURE__ */ p.createElement(
  re,
  {
    className: _e(t, aE.timelineSeparator),
    role: "separator",
    "aria-label": e,
    align: "center"
  },
  /* @__PURE__ */ p.createElement("hr", { role: "none" }),
  n,
  /* @__PURE__ */ p.createElement("hr", { role: "none" })
), sE = "_pill_1i8jm_8", cE = "_label_1i8jm_14", Sf = {
  pill: sE,
  label: cE
};
function K8({ className: e, children: t, label: n, onClick: r, ...o }) {
  const i = To(), { translate: a } = Pe();
  return /* @__PURE__ */ p.createElement(
    re,
    {
      display: "inline-flex",
      gap: "var(--cpd-space-1-5x)",
      align: "center",
      className: _e(Sf.pill, e),
      ...o
    },
    t,
    /* @__PURE__ */ p.createElement("span", { id: i, className: Sf.label }, n),
    r && /* @__PURE__ */ p.createElement(
      ut,
      {
        "aria-describedby": i,
        size: "16px",
        onClick: r,
        "aria-label": a("action|delete"),
        className: "mx_Dialog_nonDialogButton"
      },
      /* @__PURE__ */ p.createElement(R3, null)
    )
  );
}
function lE(e) {
  return (t) => {
    for (const n of e) Wa(n, t);
  };
}
function uE(e) {
  return (t) => {
    const n = [];
    for (const r of e) {
      const o = Wa(r, t), i = typeof o == "function";
      n.push(i ? o : () => Wa(r, null));
    }
    return () => {
      for (const r of n) r();
    };
  };
}
function Wa(e, t) {
  if (typeof e == "function")
    return e(t);
  e && (e.current = t);
}
var fE = parseInt(Th.split(".")[0], 10) >= 19 ? uE : lE;
function dE(e) {
  return at(() => fE(e), e);
}
const pE = "_pillInput_1yam9_8", hE = "_input_1yam9_16", mE = "_largerInput_1yam9_32", Ca = {
  pillInput: pE,
  input: hE,
  largerInput: mE
};
function G8({
  className: e,
  children: t,
  onRemoveChildren: n,
  inputProps: r,
  ...o
}) {
  const i = gt(null), a = i7(r, ["onKeyDown", "ref"]), s = dE([i, r?.ref]), c = Ah.toArray(t).length > 0;
  return /* @__PURE__ */ p.createElement(
    re,
    {
      ...o,
      gap: "var(--cpd-space-1x)",
      direction: "column",
      className: _e(Ca.pillInput, e),
      onClick: (l) => {
        l.preventDefault(), l.stopPropagation(), i.current?.focus();
      }
    },
    c && /* @__PURE__ */ p.createElement(re, { gap: "var(--cpd-space-1x)", wrap: "wrap", align: "center" }, t),
    /* @__PURE__ */ p.createElement(
      "input",
      {
        ref: s,
        autoComplete: "off",
        className: _e(Ca.input, { [Ca.largerInput]: c }),
        onKeyDown: (l) => {
          const f = l.currentTarget.value.trim();
          if (l.key === "Backspace" && !f) {
            l.preventDefault(), n?.(l);
            return;
          }
          r?.onKeyDown?.(l);
        },
        ...a
      }
    )
  );
}
const gE = "_container_mqidv_1", yE = "_description_mqidv_9", nt = {
  container: gE,
  description: yE
}, or = {
  /**
   * Connectivity to the homeserver has been lost. The user can not take any actions
   * until the connection is restored.
   */
  ConnectionLost: "ConnectionLost",
  /**
   * The homeserver has indiciated the user needs to consent to the Terms and Conditions
   * before they can send a message.
   */
  NeedsConsent: "NeedsConsent",
  /**
   * The homeserver has indiciated that messages can not be sent due to a resource limit
   * being reached. The user may use the given admin contact details.
   */
  ResourceLimited: "ResourceLimited",
  /**
   * There are messages stored locally that previously failed to send that the user
   * may now retry or delete.
   */
  UnsentMessages: "UnsentMessages",
  /**
   * There was an error creating a room. The user may retry creation.
   */
  LocalRoomFailed: "LocalRoomFailed"
};
function V8({ vm: e }) {
  const { translate: t } = Pe(), n = ve(e), r = To(), o = fe(
    (c) => {
      c.preventDefault(), e.onDeleteAllClick?.();
    },
    [e]
  ), i = fe(
    (c) => {
      c.preventDefault(), e.onResendAllClick?.();
    },
    [e]
  ), a = fe(
    (c) => {
      c.preventDefault(), e.onRetryRoomCreationClick?.();
    },
    [e]
  ), s = fe(() => {
    e.onTermsAndConditionsClicked?.();
  }, [e]);
  if (n.state === null)
    return null;
  switch (n.state) {
    case or.ConnectionLost:
      return /* @__PURE__ */ p.createElement(rr, { type: "critical", role: "status", "aria-labelledby": r }, /* @__PURE__ */ p.createElement("div", { className: nt.container }, /* @__PURE__ */ p.createElement(Mt, { id: r, weight: "semibold" }, t("room|status_bar|server_connectivity_lost_title")), /* @__PURE__ */ p.createElement(Mt, { className: nt.description, size: "sm" }, t("room|status_bar|server_connectivity_lost_description"))));
    case or.NeedsConsent:
      return /* @__PURE__ */ p.createElement(
        rr,
        {
          type: "critical",
          role: "status",
          "aria-labelledby": r,
          actions: /* @__PURE__ */ p.createElement(
            Fe,
            {
              onClick: s,
              kind: "secondary",
              size: "sm",
              as: "a",
              href: n.consentUri,
              target: "_blank",
              rel: "noreferrer noopener"
            },
            t("terms|tac_button")
          )
        },
        /* @__PURE__ */ p.createElement("div", { className: nt.container }, /* @__PURE__ */ p.createElement(Mt, { id: r, weight: "semibold" }, t("room|status_bar|requires_consent_agreement_title")))
      );
    case or.ResourceLimited:
      return /* @__PURE__ */ p.createElement(
        rr,
        {
          type: "critical",
          role: "status",
          "aria-labelledby": r,
          actions: n.adminContactHref && /* @__PURE__ */ p.createElement(
            Fe,
            {
              kind: "secondary",
              size: "sm",
              as: "a",
              href: n.adminContactHref,
              target: "_blank",
              rel: "noreferrer noopener"
            },
            "Contact admin"
          )
        },
        /* @__PURE__ */ p.createElement("div", { className: nt.container }, /* @__PURE__ */ p.createElement(Mt, { id: r, weight: "semibold" }, {
          monthly_active_user: t("room|status_bar|monthly_user_limit_reached_title"),
          hs_disabled: t("room|status_bar|homeserver_blocked_title")
        }[n.resourceLimit] || t("room|status_bar|exceeded_resource_limit_title")), /* @__PURE__ */ p.createElement(Mt, { className: nt.description, size: "sm" }, t("room|status_bar|exceeded_resource_limit_description")))
      );
    case or.LocalRoomFailed:
      return /* @__PURE__ */ p.createElement(
        rr,
        {
          role: "status",
          type: "critical",
          "aria-labelledby": r,
          actions: /* @__PURE__ */ p.createElement(
            Fe,
            {
              size: "sm",
              kind: "secondary",
              className: nt.container,
              Icon: Ef,
              onClick: a
            },
            t("action|retry")
          )
        },
        /* @__PURE__ */ p.createElement(Mt, { id: r, weight: "semibold", className: nt.container }, t("room|status_bar|failed_to_create_room_title"))
      );
    case or.UnsentMessages:
      return /* @__PURE__ */ p.createElement(
        rr,
        {
          role: "status",
          type: "critical",
          actions: n.isResending ? /* @__PURE__ */ p.createElement(Oh, null) : /* @__PURE__ */ p.createElement(p.Fragment, null, e.onDeleteAllClick && /* @__PURE__ */ p.createElement(
            Fe,
            {
              size: "sm",
              kind: "destructive",
              Icon: M3,
              disabled: n.isResending,
              onClick: o
            },
            t("room|status_bar|delete_all")
          ), e.onResendAllClick && /* @__PURE__ */ p.createElement(
            Fe,
            {
              size: "sm",
              kind: "secondary",
              Icon: Ef,
              disabled: n.isResending,
              onClick: i,
              className: nt.container
            },
            t("room|status_bar|retry_all")
          )),
          "aria-labelledby": r
        },
        /* @__PURE__ */ p.createElement("div", { className: nt.container }, /* @__PURE__ */ p.createElement(Mt, { id: r, weight: "semibold" }, t("room|status_bar|some_messages_not_sent")), /* @__PURE__ */ p.createElement(Mt, { className: nt.description, size: "sm" }, t("room|status_bar|select_messages_to_retry")))
      );
    default:
      return null;
  }
}
function Y8({ historyVisibility: e }) {
  const t = {
    color: "var(--cpd-color-icon-info-primary)",
    width: "1rem",
    // 16px at the default font size, per the design
    height: "1rem"
  };
  switch (e) {
    case "invited":
    case "joined":
      return /* @__PURE__ */ p.createElement(ii, { kind: "blue" }, /* @__PURE__ */ p.createElement(J3, { ...t }), C("room|history_visibility_badge|private"));
    case "shared":
      return /* @__PURE__ */ p.createElement(ii, { kind: "blue" }, /* @__PURE__ */ p.createElement(B3, { ...t }), C("room|history_visibility_badge|shared"));
    case "world_readable":
      return /* @__PURE__ */ p.createElement(ii, { kind: "blue" }, /* @__PURE__ */ p.createElement(Y3, { ...t }), C("room|history_visibility_badge|world_readable"));
    default:
      return null;
  }
}
const vE = "_richItem_1c0uo_8", bE = "_avatar_1c0uo_36", _E = "_title_1c0uo_41", wE = "_description_1c0uo_47", EE = "_timestamp_1c0uo_51", SE = "_checkmark_1c0uo_69", On = {
  richItem: vE,
  avatar: bE,
  title: _E,
  description: wE,
  timestamp: EE,
  checkmark: SE
}, W8 = Mf(function({
  avatar: t,
  title: n,
  description: r,
  timestamp: o,
  selected: i,
  ...a
}) {
  const s = Pe();
  return /* @__PURE__ */ p.createElement(
    "li",
    {
      className: On.richItem,
      role: "option",
      tabIndex: -1,
      "aria-selected": i,
      "aria-label": n,
      ...a
    },
    i ? /* @__PURE__ */ p.createElement(TE, null) : /* @__PURE__ */ p.createElement(re, { className: On.avatar }, t),
    /* @__PURE__ */ p.createElement("span", { className: On.title }, n),
    /* @__PURE__ */ p.createElement("span", { className: On.description }, r),
    o && /* @__PURE__ */ p.createElement("span", { role: "timer", className: On.timestamp }, s.humanizeTime(o))
  );
});
function TE() {
  return /* @__PURE__ */ p.createElement(re, { align: "center", justify: "center", "aria-hidden": "true", className: On.checkmark }, /* @__PURE__ */ p.createElement(F1, { width: "24px", height: "24px", color: "var(--cpd-color-icon-on-solid-primary)" }));
}
const AE = "_richList_1mcas_8", IE = "_title_1mcas_12", OE = "_content_1mcas_18", jE = "_empty_1mcas_26", Xr = {
  richList: AE,
  title: IE,
  content: OE,
  empty: jE
};
function PE() {
  const e = gt(null), t = fe((r) => {
    if (e.current && r.target === e.current) {
      let o = e.current?.firstElementChild;
      for (const i of e.current.children)
        if (i.getAttribute("aria-selected") === "true") {
          o = i;
          break;
        }
      o?.focus();
    }
  }, []), n = fe((r) => {
    const { key: o } = r;
    let i = !1;
    switch (o) {
      case "Enter":
      case " ": {
        i = !0, document.activeElement.click();
        break;
      }
      case "ArrowDown": {
        i = !0;
        const a = document.activeElement;
        e.current?.contains(a) && a && a.nextElementSibling?.focus();
        break;
      }
      case "ArrowUp": {
        i = !0;
        const a = document.activeElement;
        e.current?.contains(a) && a && a.previousElementSibling?.focus();
        break;
      }
      case "Home": {
        i = !0, e.current?.firstElementChild?.focus();
        break;
      }
      case "End": {
        i = !0, e.current?.lastElementChild?.focus();
        break;
      }
    }
    i && r.preventDefault();
  }, []);
  return { listRef: e, onKeyDown: n, onFocus: t };
}
function Z8({
  children: e,
  title: t,
  className: n,
  titleAttributes: r,
  isEmpty: o = !1,
  ...i
}) {
  const a = To(), { listRef: s, onKeyDown: c, onFocus: l } = PE();
  return /* @__PURE__ */ p.createElement(re, { className: _e(Xr.richList, n), direction: "column", ...i }, /* @__PURE__ */ p.createElement("span", { id: a, className: Xr.title, ...r }, t), o ? /* @__PURE__ */ p.createElement("span", { className: Xr.empty }, e) : /* @__PURE__ */ p.createElement(
    "ul",
    {
      ref: s,
      role: "listbox",
      className: Xr.content,
      "aria-labelledby": a,
      tabIndex: 0,
      onKeyDown: c,
      onFocus: l
    },
    e
  ));
}
const kE = "_title_1qyi3_8", RE = {
  title: kE
};
function ME({ vm: e }) {
  const { translate: t } = Pe(), [n, r] = Se(!1), { activeSortOption: o, isMessagePreviewEnabled: i } = ve(e);
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      open: n,
      onOpenChange: r,
      title: t("room_list|room_options"),
      showTitle: !1,
      align: "start",
      trigger: /* @__PURE__ */ p.createElement(
        ut,
        {
          tooltip: t("room_list|room_options"),
          "aria-label": t("room_list|room_options"),
          size: "28px",
          style: { padding: "4px" }
        },
        /* @__PURE__ */ p.createElement(zc, null)
      )
    },
    /* @__PURE__ */ p.createElement(Bc, { title: t("room_list|sort"), className: RE.title }),
    /* @__PURE__ */ p.createElement(
      ai,
      {
        label: t("room_list|sort_type|activity"),
        checked: o === "recent",
        onSelect: () => e.sort("recent")
      }
    ),
    /* @__PURE__ */ p.createElement(
      ai,
      {
        label: t("room_list|sort_type|unread_first"),
        checked: o === "unread-first",
        onSelect: () => e.sort("unread-first")
      }
    ),
    /* @__PURE__ */ p.createElement(
      ai,
      {
        label: t("room_list|sort_type|atoz"),
        checked: o === "alphabetical",
        onSelect: () => e.sort("alphabetical")
      }
    ),
    /* @__PURE__ */ p.createElement(Bc, { title: t("room_list|appearance") }),
    /* @__PURE__ */ p.createElement(
      jh,
      {
        label: t("room_list|show_message_previews"),
        onSelect: e.toggleMessagePreview,
        checked: i
      }
    )
  );
}
const CE = "_button_1veqf_8", xE = {
  button: CE
};
function NE({ vm: e }) {
  const { translate: t } = Pe(), { canInviteInSpace: n, canAccessSpaceSettings: r, title: o } = ve(e), [i, a] = Se(!1);
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      open: i,
      onOpenChange: a,
      title: o,
      align: "start",
      trigger: /* @__PURE__ */ p.createElement(
        ut,
        {
          className: xE.button,
          "aria-label": t("room_list|open_space_menu"),
          size: "24px",
          style: { padding: "2px" }
        },
        /* @__PURE__ */ p.createElement(L1, null)
      )
    },
    /* @__PURE__ */ p.createElement(ae, { Icon: F3, label: t("room_list|space_menu|home"), onSelect: e.openSpaceHome, hideChevron: !0 }),
    n && /* @__PURE__ */ p.createElement(ae, { Icon: ph, label: t("action|invite"), onSelect: e.inviteInSpace, hideChevron: !0 }),
    /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: K3,
        label: t("common|preferences"),
        onSelect: e.openSpacePreferences,
        hideChevron: !0
      }
    ),
    r && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: V3,
        label: t("room_list|space_menu|space_settings"),
        onSelect: e.openSpaceSettings,
        hideChevron: !0
      }
    )
  );
}
function zE({ vm: e }) {
  const { translate: t } = Pe(), [n, r] = Se(!1), { canCreateRoom: o, canCreateVideoRoom: i } = ve(e);
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      open: n,
      onOpenChange: r,
      showTitle: !1,
      title: t("action|open_menu"),
      align: "start",
      trigger: (
        // 36px button with a 24px icon
        /* @__PURE__ */ p.createElement(ut, { size: "36px", style: { padding: "6px" }, tooltip: t("action|new_conversation") }, /* @__PURE__ */ p.createElement(U1, { "aria-hidden": !0 }))
      )
    },
    /* @__PURE__ */ p.createElement(ae, { Icon: z1, label: t("action|start_chat"), onSelect: e.createChatRoom, hideChevron: !0 }),
    o && /* @__PURE__ */ p.createElement(ae, { Icon: lh, label: t("action|new_room"), onSelect: e.createRoom, hideChevron: !0 }),
    i && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: Z3,
        label: t("action|new_video_room"),
        onSelect: e.createVideoRoom,
        hideChevron: !0
      }
    )
  );
}
const BE = "_header_1tl9e_8", FE = "_title_1tl9e_13", Tf = {
  header: BE,
  title: FE
};
function J8({ vm: e }) {
  const { translate: t } = Pe(), { title: n, displaySpaceMenu: r, displayComposeMenu: o } = ve(e);
  return /* @__PURE__ */ p.createElement(
    re,
    {
      as: "header",
      className: Tf.header,
      "aria-label": t("room|context_menu|title"),
      justify: "space-between",
      align: "center",
      "data-testid": "room-list-header"
    },
    /* @__PURE__ */ p.createElement(re, { className: Tf.title, align: "center", gap: "var(--cpd-space-1x)" }, /* @__PURE__ */ p.createElement(Ph, { size: "sm", title: n }, n), r && /* @__PURE__ */ p.createElement(NE, { vm: e })),
    /* @__PURE__ */ p.createElement(re, { align: "center", gap: "var(--cpd-space-2x)" }, /* @__PURE__ */ p.createElement(ME, { vm: e }), o ? /* @__PURE__ */ p.createElement(zE, { vm: e }) : /* @__PURE__ */ p.createElement(
      ut,
      {
        onClick: (i) => e.createChatRoom(i.nativeEvent),
        tooltip: t("action|new_conversation")
      },
      /* @__PURE__ */ p.createElement(U1, { color: "var(--cpd-color-icon-secondary)", "aria-hidden": !0 })
    ))
  );
}
const DE = "_view_z7ks9_8", LE = "_search_z7ks9_16", qE = "_search_container_z7ks9_29", HE = "_search_text_z7ks9_41", Qr = {
  view: DE,
  search: LE,
  search_container: qE,
  search_text: HE
};
function X8({ vm: e }) {
  const { translate: t } = Pe(), { displayExploreButton: n, displayDialButton: r, searchShortcut: o } = ve(e);
  return /* @__PURE__ */ p.createElement(
    re,
    {
      "data-testid": "room-list-search",
      className: Qr.view,
      role: "search",
      gap: "var(--cpd-space-2x)",
      align: "center"
    },
    /* @__PURE__ */ p.createElement(
      Fe,
      {
        id: "room-list-search-button",
        className: Qr.search,
        kind: "secondary",
        size: "sm",
        Icon: G3,
        onClick: e.onSearchClick
      },
      /* @__PURE__ */ p.createElement(re, { className: Qr.search_container, as: "span", justify: "space-between" }, /* @__PURE__ */ p.createElement("span", { className: Qr.search_text }, t("action|search")), /* @__PURE__ */ p.createElement("kbd", null, o))
    ),
    r && /* @__PURE__ */ p.createElement(
      Fe,
      {
        kind: "secondary",
        size: "sm",
        Icon: C3,
        iconOnly: !0,
        "aria-label": t("left_panel|open_dial_pad"),
        onClick: e.onDialPadClick
      }
    ),
    n && /* @__PURE__ */ p.createElement(
      Fe,
      {
        kind: "secondary",
        size: "sm",
        Icon: N3,
        iconOnly: !0,
        "aria-label": t("action|explore_rooms"),
        onClick: e.onExploreClick
      }
    )
  );
}
function UE(e, t) {
  const n = gt(null), [r, o] = Se(!1), [i, a] = Se(-1);
  return on(() => {
    if (!n.current) return;
    const s = (l) => {
      let f = !1;
      Array.from(l.children).forEach((u, d) => {
        const b = u;
        if (b.setAttribute("aria-hidden", "false"), b.classList.remove(t), e) return;
        const h = b.previousElementSibling;
        h && b.offsetLeft <= h.offsetLeft && (f || a(d), f = !0), b.classList.toggle(t, f), b.setAttribute("aria-hidden", f.toString());
      }), f || a(-1), o(e || f);
    };
    s(n.current);
    const c = new ResizeObserver((l) => l.forEach((f) => s(f.target)));
    return c.observe(n.current), () => {
      c.disconnect();
    };
  }, [e, t]), { ref: n, isWrapping: r, wrappingIndex: i };
}
function $E(e, t, n) {
  const [r, o] = Se(e);
  return on(() => {
    if (!((t ? e.indexOf(t) : -1) >= n) || n === -1) {
      o(e);
      return;
    }
    o(
      e.slice().sort((s, c) => s === t && c !== t ? -1 : s !== t && c === t ? 1 : 0)
    );
  }, [e, t, n]), r;
}
const KE = "_roomListPrimaryFilters_1fj1r_8", GE = "_list_1fj1r_17", VE = "_iconButton_1fj1r_26", xa = {
  roomListPrimaryFilters: KE,
  list: GE,
  iconButton: VE
}, YE = (e) => {
  switch (e) {
    case "unread":
      return C("room_list|filters|unread");
    case "people":
      return C("room_list|filters|people");
    case "rooms":
      return C("room_list|filters|rooms");
    case "favourite":
      return C("room_list|filters|favourite");
    case "mentions":
      return C("room_list|filters|mentions");
    case "invites":
      return C("room_list|filters|invites");
    case "low_priority":
      return C("room_list|filters|low_priority");
  }
}, WE = ({
  filterIds: e,
  activeFilterId: t,
  onToggleFilter: n
}) => {
  const r = To(), [o, i] = Se(!1), {
    ref: a,
    isWrapping: s,
    wrappingIndex: c
  } = UE(o, "wrapping"), l = $E(e, t, c);
  return /* @__PURE__ */ p.createElement(
    re,
    {
      className: xa.roomListPrimaryFilters,
      "data-testid": "primary-filters",
      gap: "var(--cpd-space-3x)",
      direction: "row-reverse",
      justify: "space-between"
    },
    s && /* @__PURE__ */ p.createElement(
      ut,
      {
        kind: "secondary",
        "aria-expanded": o,
        "aria-controls": r,
        className: xa.iconButton,
        "aria-label": C(o ? "room_list|collapse_filters" : "room_list|expand_filters"),
        size: "28px",
        onClick: () => i((f) => !f)
      },
      /* @__PURE__ */ p.createElement(L1, null)
    ),
    /* @__PURE__ */ p.createElement(
      re,
      {
        id: r,
        as: "div",
        role: "listbox",
        "aria-label": C("room_list|primary_filters"),
        align: "center",
        gap: "var(--cpd-space-2x)",
        wrap: "wrap",
        className: xa.list,
        ref: a
      },
      l.map((f, u) => /* @__PURE__ */ p.createElement(
        kh,
        {
          key: `${f}-${u}`,
          role: "option",
          selected: f === t,
          onClick: () => n(f)
        },
        YE(f)
      ))
    )
  );
}, ZE = "_skeleton_1h0mx_8", JE = {
  skeleton: ZE
}, XE = () => /* @__PURE__ */ p.createElement("div", { className: JE.skeleton }), QE = "_genericPlaceholder_1sxid_8", e8 = "_title_1sxid_16", t8 = "_description_1sxid_21", n8 = "_defaultPlaceholder_1sxid_27", ao = {
  genericPlaceholder: QE,
  title: e8,
  description: t8,
  defaultPlaceholder: n8
}, r8 = ({ vm: e }) => {
  const t = ve(e);
  if (!t.activeFilterId)
    return /* @__PURE__ */ p.createElement(
      jn,
      {
        title: C("room_list|empty|no_chats"),
        description: t.canCreateRoom ? C("room_list|empty|no_chats_description") : C("room_list|empty|no_chats_description_no_room_rights")
      },
      /* @__PURE__ */ p.createElement(
        re,
        {
          className: ao.defaultPlaceholder,
          align: "center",
          justify: "center",
          direction: "column",
          gap: "var(--cpd-space-4x)"
        },
        /* @__PURE__ */ p.createElement(Fe, { size: "sm", kind: "secondary", Icon: z1, onClick: e.createChatRoom }, C("action|start_chat")),
        t.canCreateRoom && /* @__PURE__ */ p.createElement(Fe, { size: "sm", kind: "secondary", Icon: lh, onClick: e.createRoom }, C("action|new_room"))
      )
    );
  switch (t.activeFilterId) {
    case "favourite":
      return /* @__PURE__ */ p.createElement(
        jn,
        {
          title: C("room_list|empty|no_favourites"),
          description: C("room_list|empty|no_favourites_description")
        }
      );
    case "people":
      return /* @__PURE__ */ p.createElement(
        jn,
        {
          title: C("room_list|empty|no_people"),
          description: C("room_list|empty|no_people_description")
        }
      );
    case "rooms":
      return /* @__PURE__ */ p.createElement(
        jn,
        {
          title: C("room_list|empty|no_rooms"),
          description: C("room_list|empty|no_rooms_description")
        }
      );
    case "unread":
      return /* @__PURE__ */ p.createElement(
        eo,
        {
          title: C("room_list|empty|no_unread"),
          action: C("room_list|empty|show_chats"),
          onAction: () => e.onToggleFilter(t.activeFilterId)
        }
      );
    case "invites":
      return /* @__PURE__ */ p.createElement(
        eo,
        {
          title: C("room_list|empty|no_invites"),
          action: C("room_list|empty|show_activity"),
          onAction: () => e.onToggleFilter(t.activeFilterId)
        }
      );
    case "mentions":
      return /* @__PURE__ */ p.createElement(
        eo,
        {
          title: C("room_list|empty|no_mentions"),
          action: C("room_list|empty|show_activity"),
          onAction: () => e.onToggleFilter(t.activeFilterId)
        }
      );
    case "low_priority":
      return /* @__PURE__ */ p.createElement(
        eo,
        {
          title: C("room_list|empty|no_lowpriority"),
          action: C("room_list|empty|show_activity"),
          onAction: () => e.onToggleFilter(t.activeFilterId)
        }
      );
    default:
      return /* @__PURE__ */ p.createElement(
        jn,
        {
          title: C("room_list|empty|no_chats"),
          description: C("room_list|empty|no_chats_description")
        }
      );
  }
};
function jn({ title: e, description: t, children: n }) {
  return /* @__PURE__ */ p.createElement(
    re,
    {
      "data-testid": "empty-room-list",
      className: ao.genericPlaceholder,
      direction: "column",
      align: "stretch",
      justify: "center",
      gap: "var(--cpd-space-2x)"
    },
    /* @__PURE__ */ p.createElement("span", { className: ao.title }, e),
    t && /* @__PURE__ */ p.createElement("span", { className: ao.description }, t),
    n
  );
}
function eo({ title: e, action: t, onAction: n }) {
  return /* @__PURE__ */ p.createElement(jn, { title: e }, n && /* @__PURE__ */ p.createElement(Fe, { kind: "tertiary", onClick: n }, t));
}
const In = {
  ARROW_UP: "ArrowUp",
  ARROW_DOWN: "ArrowDown",
  HOME: "Home",
  END: "End",
  PAGE_UP: "PageUp",
  PAGE_DOWN: "PageDown"
};
function o8(e) {
  return e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
}
function i8(e) {
  const {
    items: t,
    getItemComponent: n,
    isItemFocusable: r,
    getItemKey: o,
    context: i,
    onKeyDown: a,
    totalCount: s,
    rangeChanged: c,
    ...l
  } = e, f = gt(null), u = gt(null), [d, b] = Se(
    e.items[0] ? o(e.items[0]) : void 0
  ), [h, g] = Se(void 0), [T, m] = Se(/* @__PURE__ */ new Map()), y = gt(!1), [S, v] = Se(!1);
  on(() => {
    const D = /* @__PURE__ */ new Map();
    t.forEach((K, W) => {
      const te = o(K);
      D.set(te, W);
    }), m(D);
  }, [t, o]), on(() => {
    t.length && (!d || T.get(d) === void 0) && b(o(t[0]));
  }, [t, o, d, T]);
  const _ = fe(
    (D, K) => {
      const W = Math.max(0, Math.min(D, t.length - 1));
      if (!y.current && t[W]) {
        const te = o(t[W]);
        y.current = !0, f.current?.scrollIntoView({
          index: W,
          align: K,
          behavior: "auto",
          done: () => {
            b(te), y.current = !1;
          }
        });
      }
    },
    [t, o]
  ), E = fe(
    (D, K, W) => {
      const te = t.length;
      let le;
      for (let pe = D; K ? pe < te : pe >= 0; pe = pe + (K ? 1 : -1))
        if (r(t[pe])) {
          le = pe;
          break;
        }
      le !== void 0 && _(le, W);
    },
    [_, t, r]
  ), I = fe(
    (D) => {
      const K = d ? T.get(d) : void 0;
      let W = !1;
      if (!D || o8(D)) {
        a?.(D);
        return;
      }
      if (D.code === In.ARROW_UP && K !== void 0)
        E(K - 1, !1), W = !0;
      else if (D.code === In.ARROW_DOWN && K !== void 0)
        E(K + 1, !0), W = !0;
      else if (D.code === In.HOME)
        _(0), W = !0;
      else if (D.code === In.END)
        _(t.length - 1), W = !0;
      else if (D.code === In.PAGE_DOWN && h && K !== void 0) {
        const te = h.endIndex - h.startIndex;
        E(Math.min(K + te, t.length - 1), !0, "start"), W = !0;
      } else if (D.code === In.PAGE_UP && h && K !== void 0) {
        const te = h.endIndex - h.startIndex;
        E(Math.max(K - te, 0), !1, "start"), W = !0;
      }
      W ? (D.stopPropagation(), D.preventDefault()) : a?.(D);
    },
    [_, E, d, T, h, t, a]
  ), k = fe((D) => {
    u.current = D;
  }, []), M = fe(
    (D, K) => {
      const W = o(D);
      v(!0), b(W), K.stopPropagation();
    },
    [o]
  ), x = fe(
    (D, K, W) => n(D, K, W, M),
    [n, M]
  ), q = fe(
    (D) => {
      if (D?.currentTarget !== u.current || typeof d != "string")
        return;
      v(!0);
      const K = T.get(d);
      K !== void 0 && h && (K < h.startIndex || K > h.endIndex) && _(K), D?.stopPropagation(), D?.preventDefault();
    },
    [T, h, _, d]
  ), V = fe((D) => {
    D.currentTarget.contains(D.relatedTarget) || v(!1);
  }, []), ie = at(
    () => ({
      tabIndexKey: d,
      focused: S,
      context: e.context || {}
    }),
    [d, S, e.context]
  ), ce = fe(
    (D) => {
      g(D), c?.(D);
    },
    [c]
  );
  return /* @__PURE__ */ p.createElement(
    Nh,
    {
      ref: f,
      scrollerRef: k,
      onKeyDown: I,
      context: ie,
      rangeChanged: ce,
      overscan: e.overscan || 0,
      data: e.items,
      totalCount: s,
      onFocus: q,
      onBlur: V,
      itemContent: x,
      ...l
    }
  );
}
const a8 = ({
  hasAnyNotificationOrActivity: e,
  muted: t,
  callType: n,
  isUnsentMessage: r,
  invited: o,
  isMention: i,
  isNotification: a,
  isActivityNotification: s,
  count: c
}) => !e && !t && !n ? null : /* @__PURE__ */ p.createElement(re, { align: "center", justify: "center", gap: "var(--cpd-space-1x)", "data-testid": "notification-decoration" }, r && /* @__PURE__ */ p.createElement(g1, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-critical-primary)" }), n === "video" && /* @__PURE__ */ p.createElement(W3, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-accent-primary)" }), n === "voice" && /* @__PURE__ */ p.createElement(X3, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-accent-primary)" }), o && /* @__PURE__ */ p.createElement(x3, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-accent-primary)" }), i && /* @__PURE__ */ p.createElement(U3, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-accent-primary)" }), (i || a) && /* @__PURE__ */ p.createElement(Rh, { count: c || null }), s && /* @__PURE__ */ p.createElement(Mh, null), t && /* @__PURE__ */ p.createElement(rh, { width: "20px", height: "20px", fill: "var(--cpd-color-icon-tertiary)" }));
function s8({ vm: e }) {
  const [t, n] = Se(!1);
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      open: t,
      onOpenChange: n,
      title: C("room_list|room|more_options"),
      showTitle: !1,
      align: "start",
      trigger: /* @__PURE__ */ p.createElement(
        ut,
        {
          tooltip: C("room_list|room|more_options"),
          "aria-label": C("room_list|room|more_options"),
          size: "24px"
        },
        /* @__PURE__ */ p.createElement(zc, null)
      )
    },
    /* @__PURE__ */ p.createElement(bh, { vm: e })
  );
}
function bh({ vm: e }) {
  const t = ve(e);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    /* @__PURE__ */ p.createElement("div", { onKeyDown: (n) => n.stopPropagation() }, t.canMarkAsRead && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: q3,
        label: C("room_list|more_options|mark_read"),
        onSelect: e.onMarkAsRead,
        onClick: (n) => n.stopPropagation(),
        hideChevron: !0
      }
    ), t.canMarkAsUnread && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: H3,
        label: C("room_list|more_options|mark_unread"),
        onSelect: e.onMarkAsUnread,
        onClick: (n) => n.stopPropagation(),
        hideChevron: !0
      }
    ), /* @__PURE__ */ p.createElement(
      Fc,
      {
        checked: t.isFavourite,
        Icon: z3,
        label: C("room_list|more_options|favourited"),
        onSelect: e.onToggleFavorite,
        onClick: (n) => n.stopPropagation()
      }
    ), /* @__PURE__ */ p.createElement(
      Fc,
      {
        checked: t.isLowPriority,
        Icon: k3,
        label: C("room_list|more_options|low_priority"),
        onSelect: e.onToggleLowPriority,
        onClick: (n) => n.stopPropagation()
      }
    ), t.canInvite && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: ph,
        label: C("action|invite"),
        onSelect: e.onInvite,
        onClick: (n) => n.stopPropagation(),
        hideChevron: !0
      }
    ), t.canCopyRoomLink && /* @__PURE__ */ p.createElement(
      ae,
      {
        Icon: L3,
        label: C("room_list|more_options|copy_link"),
        onSelect: e.onCopyRoomLink,
        onClick: (n) => n.stopPropagation(),
        hideChevron: !0
      }
    ), /* @__PURE__ */ p.createElement(Ch, null), /* @__PURE__ */ p.createElement(
      ae,
      {
        kind: "critical",
        Icon: D3,
        label: C("room_list|more_options|leave_room"),
        onSelect: e.onLeaveRoom,
        onClick: (n) => n.stopPropagation(),
        hideChevron: !0
      }
    ))
  );
}
var Ae = /* @__PURE__ */ ((e) => (e.AllMessages = "all_messages", e.AllMessagesLoud = "all_messages_loud", e.MentionsOnly = "mentions_only", e.Mute = "mute", e))(Ae || {});
function c8({ vm: e }) {
  const t = ve(e), [n, r] = Se(!1), o = t.roomNotifState === Ae.Mute, i = /* @__PURE__ */ p.createElement(F1, { width: "24px", height: "24px", color: "var(--cpd-color-icon-primary)" });
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      open: n,
      onOpenChange: r,
      title: C("room_list|notification_options"),
      showTitle: !1,
      align: "start",
      trigger: /* @__PURE__ */ p.createElement(
        ut,
        {
          size: "24px",
          tooltip: C("room_list|notification_options"),
          "aria-label": C("room_list|notification_options")
        },
        o ? /* @__PURE__ */ p.createElement(rh, null) : /* @__PURE__ */ p.createElement($3, null)
      )
    },
    /* @__PURE__ */ p.createElement(
      "div",
      {
        onKeyDown: (a) => a.stopPropagation()
      },
      /* @__PURE__ */ p.createElement(
        ae,
        {
          "aria-selected": t.roomNotifState === Ae.AllMessages,
          hideChevron: !0,
          label: C("notifications|default_settings"),
          onSelect: () => e.onSetRoomNotifState(Ae.AllMessages),
          onClick: (a) => a.stopPropagation()
        },
        t.roomNotifState === Ae.AllMessages && i
      ),
      /* @__PURE__ */ p.createElement(
        ae,
        {
          "aria-selected": t.roomNotifState === Ae.AllMessagesLoud,
          hideChevron: !0,
          label: C("notifications|all_messages"),
          onSelect: () => e.onSetRoomNotifState(Ae.AllMessagesLoud),
          onClick: (a) => a.stopPropagation()
        },
        t.roomNotifState === Ae.AllMessagesLoud && i
      ),
      /* @__PURE__ */ p.createElement(
        ae,
        {
          "aria-selected": t.roomNotifState === Ae.MentionsOnly,
          hideChevron: !0,
          label: C("notifications|mentions_keywords"),
          onSelect: () => e.onSetRoomNotifState(Ae.MentionsOnly),
          onClick: (a) => a.stopPropagation()
        },
        t.roomNotifState === Ae.MentionsOnly && i
      ),
      /* @__PURE__ */ p.createElement(
        ae,
        {
          "aria-selected": t.roomNotifState === Ae.Mute,
          hideChevron: !0,
          label: C("notifications|mute_room"),
          onSelect: () => e.onSetRoomNotifState(Ae.Mute),
          onClick: (a) => a.stopPropagation()
        },
        t.roomNotifState === Ae.Mute && i
      )
    )
  );
}
const l8 = "_roomListItem_xvld0_17", u8 = "_hoverMenu_xvld0_33", f8 = "_notificationDecoration_xvld0_52", d8 = "_content_xvld0_62", p8 = "_text_xvld0_77", h8 = "_roomName_xvld0_81", m8 = "_messagePreview_xvld0_87", g8 = "_selected_xvld0_95", y8 = "_bold_xvld0_99", ht = {
  roomListItem: l8,
  hoverMenu: u8,
  notificationDecoration: f8,
  content: d8,
  text: p8,
  roomName: h8,
  messagePreview: m8,
  selected: g8,
  bold: y8
}, v8 = ({
  showMoreOptionsMenu: e,
  showNotificationMenu: t,
  vm: n
}) => /* @__PURE__ */ p.createElement(re, { className: ht.hoverMenu, align: "center", gap: "var(--cpd-space-1x)" }, e && /* @__PURE__ */ p.createElement(s8, { vm: n }), t && /* @__PURE__ */ p.createElement(c8, { vm: n })), b8 = ({
  vm: e,
  children: t
}) => /* @__PURE__ */ p.createElement(
  xh,
  {
    title: C("room_list|room|more_options"),
    showTitle: !1,
    hasAccessibleAlternative: !0,
    trigger: t
  },
  /* @__PURE__ */ p.createElement(bh, { vm: e })
);
function _8(e, t) {
  return t.isUnsentMessage ? C("room_list|a11y|unsent_message", { roomName: e }) : t.invited ? C("room_list|a11y|invitation", { roomName: e }) : t.isMention && t.count ? C("room_list|a11y|mention", { roomName: e, count: t.count }) : t.hasUnreadCount && t.count ? C("room_list|a11y|unread", { roomName: e, count: t.count }) : C("room_list|a11y|default", { roomName: e });
}
const w8 = Mf(function({
  vm: t,
  isSelected: n,
  isFocused: r,
  onFocus: o,
  roomIndex: i,
  roomCount: a,
  renderAvatar: s,
  ...c
}) {
  const l = gt(null), f = ve(t);
  on(() => {
    r && l.current?.focus({ preventScroll: !0, focusVisible: !0 });
  }, [r]);
  const u = _8(f.name, f.notification), d = /* @__PURE__ */ p.createElement(
    re,
    {
      as: "button",
      ref: l,
      className: _e(ht.roomListItem, "mx_RoomListItemView", {
        [ht.selected]: n,
        [ht.bold]: f.isBold,
        mx_RoomListItemView_selected: n
      }),
      gap: "var(--cpd-space-3x)",
      align: "center",
      type: "button",
      role: "option",
      "aria-posinset": i + 1,
      "aria-setsize": a,
      "aria-selected": n,
      "aria-label": u,
      onClick: t.onOpenRoom,
      onFocus: (b) => o(f.id, b),
      tabIndex: r ? 0 : -1,
      ...c
    },
    s(f.room),
    /* @__PURE__ */ p.createElement(re, { className: ht.content, gap: "var(--cpd-space-2x)", align: "center", justify: "space-between" }, /* @__PURE__ */ p.createElement("div", { className: ht.text }, /* @__PURE__ */ p.createElement("div", { className: ht.roomName, title: f.name, "data-testid": "room-name" }, f.name), f.messagePreview && /* @__PURE__ */ p.createElement("div", { className: ht.messagePreview, title: f.messagePreview }, f.messagePreview)), (f.showMoreOptionsMenu || f.showNotificationMenu) && /* @__PURE__ */ p.createElement(
      v8,
      {
        showMoreOptionsMenu: f.showMoreOptionsMenu,
        showNotificationMenu: f.showNotificationMenu,
        vm: t
      }
    ), /* @__PURE__ */ p.createElement("div", { className: ht.notificationDecoration, "aria-hidden": !0 }, /* @__PURE__ */ p.createElement(a8, { ...f.notification })))
  );
  return /* @__PURE__ */ p.createElement(b8, { vm: t }, d);
}), _h = 48, Af = 25 * _h;
function E8({ vm: e, renderAvatar: t, onKeyDown: n }) {
  const r = ve(e), { roomListState: o, roomIds: i } = r, a = o.activeRoomIndex, s = gt(void 0), c = gt(void 0), l = i.length, f = fe(
    (g) => {
      e.updateVisibleRooms(g.startIndex, g.endIndex);
    },
    [e]
  ), u = fe(
    (g, T, m, y) => {
      const S = a === g, v = e.getRoomItemViewModel(T), _ = m.focused && m.tabIndexKey === T;
      return /* @__PURE__ */ p.createElement(
        w8,
        {
          key: T,
          vm: v,
          renderAvatar: t,
          isSelected: S,
          isFocused: _,
          onFocus: y,
          roomIndex: g,
          roomCount: l
        }
      );
    },
    [a, l, t, e]
  ), d = fe((g) => g, []), b = at(
    () => ({ spaceId: o.spaceId || "", filterKeys: o.filterKeys }),
    [o.spaceId, o.filterKeys]
  ), h = fe(
    (g) => {
      const { spaceId: T, filterKeys: m } = g.context.context, y = s.current !== T || !Jw(c.current, m);
      return c.current = m, s.current = T, y ? {
        align: "start",
        index: a || 0,
        behavior: "auto"
      } : !1;
    },
    [a]
  );
  return /* @__PURE__ */ p.createElement(
    i8,
    {
      context: b,
      scrollIntoViewOnChange: h,
      initialTopMostItemIndex: a,
      "data-testid": "room-list",
      role: "listbox",
      "aria-label": C("room_list|list_title"),
      fixedItemHeight: _h,
      items: i,
      getItemComponent: u,
      getItemKey: d,
      isItemFocusable: () => !0,
      rangeChanged: f,
      onKeyDown: n,
      increaseViewportBy: {
        bottom: Af,
        top: Af
      }
    }
  );
}
const Q8 = ({ vm: e, renderAvatar: t, onKeyDown: n }) => {
  const r = ve(e);
  let o;
  return r.isLoadingRooms ? o = /* @__PURE__ */ p.createElement(XE, null) : r.isRoomListEmpty ? o = /* @__PURE__ */ p.createElement(r8, { vm: e }) : o = /* @__PURE__ */ p.createElement(E8, { vm: e, renderAvatar: t, onKeyDown: n }), /* @__PURE__ */ p.createElement(p.Fragment, null, /* @__PURE__ */ p.createElement("div", null, /* @__PURE__ */ p.createElement(
    WE,
    {
      filterIds: r.filterIds,
      activeFilterId: r.activeFilterId,
      onToggleFilter: e.onToggleFilter
    }
  )), o);
}, Na = {
  "box-flex": "_box-flex_1odfs_9",
  "box-shrink": "_box-shrink_1odfs_13",
  "box-grow": "_box-grow_1odfs_17"
};
function e5({
  as: e = "div",
  flex: t = null,
  shrink: n = null,
  grow: r = null,
  className: o,
  children: i,
  ...a
}) {
  const s = at(() => {
    const c = {};
    return t && (c["--mx-box-flex"] = t), n && (c["--mx-box-shrink"] = n), r && (c["--mx-box-grow"] = r), c;
  }, [t, r, n]);
  return p.createElement(
    e,
    {
      ...a,
      className: _e(o, {
        [Na["box-flex"]]: !!t,
        [Na["box-shrink"]]: !!n,
        [Na["box-grow"]]: !!r
      }),
      style: s
    },
    i
  );
}
const t5 = ({ vm: e }) => {
  const { translate: t } = Pe(), {
    showStreamAudioStreamButton: n,
    showEditButton: r,
    showSnapshotButton: o,
    showDeleteButton: i,
    showRevokeButton: a,
    showMoveButtons: s,
    isMenuOpened: c,
    userWidget: l,
    trigger: f
  } = ve(e);
  let u;
  n && (u = /* @__PURE__ */ p.createElement(ae, { onSelect: e.onStreamAudioClick, label: t("widget|context_menu|start_audio_stream") }));
  let d;
  r && (d = /* @__PURE__ */ p.createElement(ae, { onSelect: e.onEditClick, label: t("action|edit") }));
  let b;
  o && (b = /* @__PURE__ */ p.createElement(ae, { onSelect: e.onSnapshotClick, label: t("widget|context_menu|screenshot") }));
  let h;
  i && (h = /* @__PURE__ */ p.createElement(
    ae,
    {
      onSelect: e.onDeleteClick,
      label: t(l ? "action|remove" : "widget|context_menu|remove")
    }
  ));
  let g;
  a && (g = /* @__PURE__ */ p.createElement(ae, { onSelect: e.onRevokeClick, label: t("widget|context_menu|revoke") }));
  const [T, m] = s;
  let y;
  T && (y = /* @__PURE__ */ p.createElement(ae, { onSelect: () => e.onMoveButton(-1), label: t("widget|context_menu|move_left") }));
  let S;
  m && (S = /* @__PURE__ */ p.createElement(ae, { onSelect: () => e.onMoveButton(1), label: t("widget|context_menu|move_right") }));
  const v = () => c ? /* @__PURE__ */ p.createElement(p.Fragment, null, u, d, g, h, b, y, S) : null, _ = p.isValidElement(f) ? f : /* @__PURE__ */ p.createElement(ut, { size: "24px", "aria-label": "context menu trigger button", inert: !0, tabIndex: -1 }, /* @__PURE__ */ p.createElement(zc, null));
  return /* @__PURE__ */ p.createElement(
    Nn,
    {
      title: "Widget context menu",
      open: c,
      showTitle: !1,
      side: "right",
      align: "start",
      trigger: _,
      onOpenChange: e.onFinished
    },
    v()
  );
}, If = 15e3, Of = 75e3, jf = 45, Pf = 75, kf = 23, Rf = 26;
function S8(e, t) {
  let r = Date.now() - e;
  const o = Math.abs(Math.ceil(r / 6e4)), i = Math.ceil(o / 60), a = Math.ceil(i / 24), s = t?.translate ?? C;
  return r >= 0 ? r <= If ? s("time|few_seconds_ago") : r <= Of ? s("time|about_minute_ago") : o <= jf ? s("time|n_minutes_ago", { num: o }) : o <= Pf ? s("time|about_hour_ago") : i <= kf ? s("time|n_hours_ago", { num: i }) : i <= Rf ? s("time|about_day_ago") : s("time|n_days_ago", { num: a }) : (r = Math.abs(r), r <= If ? s("time|in_few_seconds") : r <= Of ? s("time|in_about_minute") : o <= jf ? s("time|in_n_minutes", { num: o }) : o <= Pf ? s("time|in_about_hour") : i <= kf ? s("time|in_n_hours", { num: i }) : i <= Rf ? s("time|in_about_day") : s("time|in_n_days", { num: a }));
}
function n5(e, t) {
  return Number.isFinite(e) ? Number(e) : t;
}
function r5(e, t, n) {
  return Math.min(Math.max(e, t), n);
}
function o5(...e) {
  return [...e].reduce((t, n) => n + t, 0);
}
function i5(e, t, n) {
  return e * (n - t) + t;
}
function a5(e, t, n) {
  const r = (e - t) / (n - t);
  return Number.isNaN(r) ? 0 : r;
}
class s5 {
  /**
   * Read the current language of the user in IETF Language Tag format
   */
  get language() {
    return m3();
  }
  /**
   * Register translations for the module, may override app's existing translations
   */
  register(t) {
    const n = {};
    for (const r in t)
      for (const o in t[r])
        n[o] = n[o] || {}, n[o][r] = t[r][o];
    for (const r in n)
      h3(r, n[r]);
  }
  /**
   * Perform a translation, with optional variables
   * @param key - The key to translate
   * @param variables - Optional variables to interpolate into the translation
   */
  translate(t, n) {
    return C(t, n);
  }
  humanizeTime(t) {
    return S8(t, this);
  }
}
export {
  k8 as AudioPlayerView,
  R8 as AvatarWithDetails,
  rr as Banner,
  O8 as BaseViewModel,
  e5 as Box,
  Il as Clock,
  H8 as DecryptionFailureBodyView,
  nE as DecryptionFailureReason,
  zh as Disposables,
  L8 as EventTileBubble,
  re as Flex,
  Y8 as HistoryVisibilityBadge,
  s5 as I18nApi,
  Bf as I18nContext,
  _7 as KEY_SEPARATOR,
  $h as MediaBody,
  Dh as MockViewModel,
  bh as MoreOptionContent,
  a8 as NotificationDecoration,
  K8 as Pill,
  G8 as PillInput,
  am as PlayPauseButton,
  U8 as ReactionsRowButtonTooltipView,
  W8 as RichItem,
  Z8 as RichList,
  r8 as RoomListEmptyStateView,
  J8 as RoomListHeaderView,
  b8 as RoomListItemContextMenu,
  v8 as RoomListItemHoverMenu,
  s8 as RoomListItemMoreOptionsMenu,
  c8 as RoomListItemNotificationMenu,
  w8 as RoomListItemView,
  XE as RoomListLoadingSkeleton,
  WE as RoomListPrimaryFilters,
  X8 as RoomListSearchView,
  Q8 as RoomListView,
  Ae as RoomNotifState,
  or as RoomStatusBarState,
  V8 as RoomStatusBarView,
  D8 as SasEmoji,
  u7 as SeekBar,
  Bh as Snapshot,
  q8 as TextualEventView,
  $8 as TimelineSeparator,
  Fh as ViewModelSubscriptions,
  i8 as VirtualizedList,
  E8 as VirtualizedRoomListView,
  u5 as VirtuosoMockContext,
  t5 as WidgetContextMenuView,
  C as _t,
  z8 as _tDom,
  x8 as _td,
  r5 as clamp,
  n5 as defaultNumber,
  sm as formatBytes,
  lv as formatSeconds,
  b3 as getLangsJson,
  m3 as getLocale,
  v1 as getNormalizedLanguageKeys,
  S8 as humanizeTime,
  N8 as lookupString,
  b7 as normalizeLanguageKey,
  a5 as percentageOf,
  i5 as percentageWithin,
  h3 as registerTranslations,
  _f as replaceByRegexes,
  B8 as sanitizeForTranslation,
  F8 as setLanguage,
  C8 as setLocale,
  M8 as setMissingEntryGenerator,
  M1 as substitute,
  o5 as sum,
  UE as useCollapseFilters,
  j8 as useCreateAutoDisposedViewModel,
  Pe as useI18n,
  P8 as useMockedViewModel,
  ve as useViewModel,
  $E as useVisibleFilters
};
