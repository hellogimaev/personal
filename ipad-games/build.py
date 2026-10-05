#!/usr/bin/env python3
"""Inline everything into dist/index.html (one self-contained file) + PWA files."""
import glob, hashlib, os, shutil
here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, 'src')
dist = os.environ.get('OUT') or os.path.join(here, 'dist')
os.makedirs(dist, exist_ok=True)
read = lambda p: open(p, encoding='utf-8').read()
html = read(os.path.join(src, 'index.html'))
css = read(os.path.join(src, 'style.css'))
js_files = [os.path.join(src, 'core.js')] + sorted(glob.glob(os.path.join(src, 'games', '*.js'))) + [os.path.join(src, 'main.js')]
scripts = []
for f in js_files:
    code = read(f).replace('</script', '<\\/script')
    scripts.append(f'<script>/* {os.path.relpath(f, src)} */\n{code}\n</script>')
out = html.replace('/*STYLE*/', css).replace('<!--SCRIPTS-->', '\n'.join(scripts))
open(os.path.join(dist, 'index.html'), 'w', encoding='utf-8').write(out)
ver = hashlib.sha1(out.encode()).hexdigest()[:10]
sw = read(os.path.join(src, 'sw.js')).replace('__VERSION__', ver)
open(os.path.join(dist, 'sw.js'), 'w', encoding='utf-8').write(sw)
for f in ['manifest.webmanifest', 'icon-180.png', 'icon-512.png']:
    p = os.path.join(src, f)
    if os.path.exists(p): shutil.copy(p, dist)
print(f'dist/index.html {len(out)//1024} KB, {len(js_files)-2} games, version {ver}')

# Artifact variant: page content only (the host adds doctype/head/body), no PWA links.
import re
art = out
art = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>', '', art)
art = re.sub(r'<link rel="(manifest|apple-touch-icon)"[^>]*>\s*', '', art)
art = re.sub(r'<meta name="(viewport|apple[^"]*|mobile[^"]*|theme-color)"[^>]*>\s*', '', art)
art = re.sub(r'<meta charset="utf-8">\s*', '', art)
art = art.replace('</head>', '').replace('<body>', '').replace('</body>', '').replace('</html>', '')
open(os.path.join(dist, 'artifact.html'), 'w', encoding='utf-8').write(art.strip() + '\n')
