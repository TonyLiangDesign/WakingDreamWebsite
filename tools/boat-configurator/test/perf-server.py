"""Local-only performance harness, never included in the published page.
Usage: python3 test/perf-server.py /path/to/site-root 8194
Open /boat-configurator/?qaView=hero&qaCompile&cold=UNIQUE_INTEGER plus a build hash.
All responses use no-store. The optional cold value changes shader sources; driver
caches may still reuse compiled work. Do not report this as a fresh GPU process.
Read document.body.dataset.perf after boat-visible-observed for timing and geometry.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import sys, os
os.chdir(sys.argv[1])
probe = '''<script>
const cold=new URLSearchParams(location.search).get('cold');
if(cold&&/^\\d+$/.test(cold)){const original=WebGL2RenderingContext.prototype.shaderSource;WebGL2RenderingContext.prototype.shaderSource=function(shader,source){const line=source.indexOf('\\n')+1;return original.call(this,shader,source.slice(0,line)+'#define COLD_'+cold+' 1\\n'+source.slice(line));};}
const raf=requestAnimationFrame;window.requestAnimationFrame=(callback)=>raf((time)=>{callback(time);if(performance.getEntriesByName('lit-shown').length&&!performance.getEntriesByName('lit-frame-observed').length)performance.mark('lit-frame-observed');});
addEventListener('transitionend',e=>{if(e.target.id==='loading'&&e.propertyName==='opacity')performance.mark('boat-visible-observed');});
addEventListener('error',e=>document.body.dataset.perfError=e.message);
setInterval(()=>{document.body.dataset.perf=JSON.stringify({marks:performance.getEntriesByType('mark').map(e=>[e.name,Math.round(e.startTime)]),nav:performance.getEntriesByType('navigation').map(e=>({ttfb:e.responseStart,dom:e.domContentLoadedEventEnd,load:e.loadEventEnd})),resources:performance.getEntriesByType('resource').map(e=>({name:e.name.split('/').pop(),ms:Math.round(e.duration),bytes:e.encodedBodySize})),size:[innerWidth,innerHeight,devicePixelRatio],geometry:(()=>{if(!window.qaCompile)return null;let vertices=0,bytes=0,triangles=0,meshes=0;for(const part of [qaCompile.current.boat,qaCompile.current.trailer,qaCompile.current.cradle])part.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;vertices+=g.attributes.position.count;triangles+=(g.index?.count??g.attributes.position.count)/3;bytes+=g.index?.array.byteLength??0;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;});return {vertices,bytes,triangles,meshes};})()});},250);
</script>'''
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  super().end_headers()
 def do_GET(self):
  p=self.translate_path(self.path)
  if os.path.isdir(p): p=os.path.join(p,'index.html')
  if p.endswith('.html') and os.path.isfile(p):
   data=Path(p).read_text().replace('</head>',probe+'</head>').encode()
   self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
  else: super().do_GET()
ThreadingHTTPServer(('127.0.0.1',int(sys.argv[2])),Handler).serve_forever()
