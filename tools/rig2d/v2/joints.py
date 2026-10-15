# Joints of Juts's skeleton, marked on the bare base body and on the armour (each in its own picture's pixels, y down).
# R = his right side = the FAR side on screen (screen-left, the spear hand); L = his left = the NEAR side (screen-right).
BASE = dict(
  root=(178, 470), pelvis=(150, 232), chest=(148, 196), neck=(150, 104), head=(147, 50),
  shR=(112, 113), elR=(95, 165), wrR=(76, 202), hdR=(63, 215),
  shL=(192, 114), elL=(238, 178), wrL=(248, 228), hdL=(255, 256),
  hipR=(122, 240), knR=(60, 300), anR=(86, 385), toR=(50, 402),
  hipL=(180, 246), knL=(222, 335), anL=(268, 452), toL=(284, 478),
)
ARMOR = dict(
  root=(300, 515), pelvis=(270, 302), chest=(268, 256), neck=(268, 192), head=(263, 142),
  shR=(218, 213), elR=(190, 262), wrR=(182, 296), hdR=(174, 308),
  shL=(330, 216), elL=(362, 262), wrL=(385, 303), hdL=(396, 330),
  hipR=(238, 332), knR=(165, 390), anR=(205, 463), toR=(168, 485),
  hipL=(302, 336), knL=(350, 400), anL=(395, 500), toL=(412, 538),
  wingRr=(222, 178), wingRt=(110, 108), wingLr=(330, 178), wingLt=(600, 95),
)
# bones: name, parent, from joint, to joint
BONES = [
  ('root', None, 'root', 'pelvis'), ('pelvis', 'root', 'pelvis', 'chest'), ('chest', 'pelvis', 'chest', 'neck'), ('head', 'chest', 'neck', 'head'),
  ('upR', 'chest', 'shR', 'elR'), ('foR', 'upR', 'elR', 'wrR'), ('haR', 'foR', 'wrR', 'hdR'),
  ('upL', 'chest', 'shL', 'elL'), ('foL', 'upL', 'elL', 'wrL'), ('haL', 'foL', 'wrL', 'hdL'),
  ('thR', 'pelvis', 'hipR', 'knR'), ('shnR', 'thR', 'knR', 'anR'), ('ftR', 'shnR', 'anR', 'toR'),
  ('thL', 'pelvis', 'hipL', 'knL'), ('shnL', 'thL', 'knL', 'anL'), ('ftL', 'shnL', 'anL', 'toL'),
  ('wingR', 'chest', 'wingRr', 'wingRt'), ('wingL', 'chest', 'wingLr', 'wingLt'),
]
