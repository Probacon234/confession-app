---
name: Patch application behavior
description: A recovery pattern for repeated exact-context patch failures on small existing files.
---

If a small existing source or configuration file repeatedly rejects an exact-context patch after its current contents have been confirmed, stop repeating similar hunks and replace only that file through the patch tool, reconstructing its contents from the read result.

**Why:** This worked after repeated patch-tool rejections on small starter files even though the visible content appeared to match.

**How to apply:** Use this only for small source/configuration files after reading them. Do not use it to replace large files, user data, or profile files.