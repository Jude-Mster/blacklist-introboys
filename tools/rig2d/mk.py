import base64
s=open('page.html').read()
s=s.replace('__RIG__',open('rig.min.json').read()).replace('__SKEL__',base64.b64encode(open('skel_v.jpg','rb').read()).decode())
open('/tmp/claude-0/-home-claude-blacklist-introboys/96709067-de3d-5e49-8ec9-7afb899e1570/scratchpad/rig/index.html','w').write(s)
