/**
 * Detect Flexa auth routes that should open the native Login / Signup screens
 * instead of rendering the website auth pages inside the WebView.
 */

function detectNativeAuthMode(urlOrPath) {
  if (!urlOrPath) return null;
  let path = urlOrPath;
  try {
    if (/^https?:\/\//i.test(urlOrPath)) {
      path = new URL(urlOrPath).pathname;
    }
  } catch {
    /* treat as path */
  }
  const normalized = path.toLowerCase();
  if (
    normalized === "/auth/login" ||
    normalized.startsWith("/auth/login?") ||
    normalized.startsWith("/auth/login/")
  ) {
    // Phone login stays on the website for now — only the email login globe screen is native.
    if (normalized.includes("login-phone")) return null;
    return "login";
  }
  if (
    normalized === "/auth/register" ||
    normalized.startsWith("/auth/register?") ||
    normalized.startsWith("/auth/register/")
  ) {
    return "register";
  }
  return null;
}

/** Injected into the marketplace WebView to catch SPA navigations to auth. */
const NATIVE_AUTH_WATCH_SCRIPT = `
(function(){
  if(window.__flexaNativeAuthWatch)return;
  window.__flexaNativeAuthWatch=true;
  function report(){
    try{
      var p=location.pathname||"";
      var mode=null;
      if(p==="/auth/login"||p.indexOf("/auth/login?")===0)mode="login";
      else if(p==="/auth/register"||p.indexOf("/auth/register?")===0)mode="register";
      if(mode&&window.ReactNativeWebView){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:"NATIVE_AUTH",mode:mode,path:p+location.search}));
      }
    }catch(e){}
  }
  var _ps=history.pushState,_rs=history.replaceState;
  history.pushState=function(){_ps.apply(this,arguments);report();};
  history.replaceState=function(){_rs.apply(this,arguments);report();};
  window.addEventListener("popstate",report);
  report();
})();true;
`;

function makeAuthTokenInjection(token) {
  const encoded = JSON.stringify(token);
  return `(function(){try{if(location.protocol!=="https:"||!(location.hostname==="flexamarket.com"||location.hostname.endsWith(".flexamarket.com")||location.hostname.endsWith(".ondigitalocean.app")))return;localStorage.setItem("flexamarket_token",${encoded});document.cookie="fm_token="+encodeURIComponent(${encoded})+"; path=/; SameSite=Lax";try{sessionStorage.setItem("flexamarket_token",${encoded});}catch(e){}if(typeof window.__onNativeAuth==="function")window.__onNativeAuth(${encoded});}catch(e){}})();true;`;
}

module.exports = {
  detectNativeAuthMode,
  NATIVE_AUTH_WATCH_SCRIPT,
  makeAuthTokenInjection,
};
