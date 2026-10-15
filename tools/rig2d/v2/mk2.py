import base64, json
s = open('page2.html').read()
r = json.load(open('rig2.json'))
b64 = lambda f: base64.b64encode(open(f, 'rb').read()).decode()
s = s.replace('__RIG__', json.dumps(r, separators=(',', ':'))).replace('__REF_BASE__', b64('ref_base.jpg')).replace('__REF_ARMOR__', b64('ref_armor.jpg')).replace('__REF_SKY__', b64('ref_sky.jpg'))
open('index.html', 'w').write(s); print(len(s) // 1024, 'KB')
