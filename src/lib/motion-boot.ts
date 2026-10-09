// Kept out of the client module so the server layout can inline it as a plain string.
// The storage key must match KEY in motion.ts.
/** Inline script for <head>: sets the class before first paint so CSS motion never flashes. */
export const motionBootScript = `(function(){try{var m=new URLSearchParams(location.search).get("motion");var s=null;try{s=localStorage.getItem("nova-motion")}catch(e){}var c=m==="full"||m==="reduced"?m:s;var r=c==="full"?false:c==="reduced"?true:matchMedia("(prefers-reduced-motion: reduce)").matches;if(r)document.documentElement.classList.add("reduce-motion")}catch(e){}})();`;
