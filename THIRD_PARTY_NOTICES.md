# Third-party notices

IsoBlock's own code is under the MIT license in [`LICENSE`](LICENSE). The files that `npm run build` writes to `dist/` also contain the third-party code below. The repository does not commit `dist/`; whoever distributes a build distributes these notices with it.

| Package | Version | License | In | Source |
|---|---|---|---|---|
| `ajv` | 8.20.0 | MIT | `isoblock.mjs`, `editor.html` | [github.com/ajv-validator/ajv](https://github.com/ajv-validator/ajv) |
| `fast-deep-equal` | 3.1.3 | MIT | `isoblock.mjs`, `editor.html` | [github.com/epoberezkin/fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) |
| `json-schema-traverse` | 1.0.0 | MIT | `isoblock.mjs`, `editor.html` | [github.com/epoberezkin/json-schema-traverse](https://github.com/epoberezkin/json-schema-traverse) |
| `fast-uri` | 3.1.8 | BSD-3-Clause | `isoblock.mjs`, `editor.html` | [github.com/fastify/fast-uri](https://github.com/fastify/fast-uri) |
| `@resvg/resvg-wasm` | 2.6.2 | MPL-2.0 | `isoblock.mjs` | [github.com/yisibl/resvg-js](https://github.com/yisibl/resvg-js/tree/v2.6.2) |

The versions are those of `package-lock.json`. `ajv` uses `fast-deep-equal`, `json-schema-traverse` and `fast-uri`, so the bundles contain them too.

## `@resvg/resvg-wasm`

`dist/isoblock.mjs` embeds the JavaScript and the WebAssembly module of `@resvg/resvg-wasm` 2.6.2, unmodified, to render PNG files. It is subject to the terms of the Mozilla Public License, v. 2.0. A copy of the license is at https://mozilla.org/MPL/2.0/. Its source code form is at https://github.com/yisibl/resvg-js, tag `v2.6.2` (directory `wasm/` and the Rust crate at the root).

The WebAssembly module is compiled from Rust code: resvg-js, the resvg crates `resvg`, `usvg`, `usvg-parser`, `usvg-tree` and `usvg-text-layout` 0.34.0 (MPL-2.0, source at https://github.com/RazrFalcon/resvg, tag `v0.34.0`), and other crates. The module names these crates and versions: adler32 1.2.0, alloc-no-stdlib 2.0.4, arrayvec 0.7.4, base64 0.21.7, bitvec 1.0.1, brotli-decompressor 2.5.1, bytemuck 1.15.0, bytes 1.6.0, data-url 0.2.0, deflate 1.0.0, flate2 1.0.28, fontdb 0.14.1, gif 0.12.0, imagesize 0.12.0, jpeg-decoder 0.3.1, kurbo 0.9.5, miniz_oxide 0.5.4, miniz_oxide 0.7.2, pathfinder_content 0.5.0, png 0.17.5, rctree 0.5.0, roxmltree 0.18.1, rustybuzz 0.7.0, serde_json 1.0.115, simplecss 0.2.1, slotmap 1.0.7, smallvec 1.13.2, svgtypes 0.11.0, svgtypes 0.14.0, tiny-skia 0.10.0, tiny-skia-path 0.10.0, tinyvec 1.6.0, ttf-parser 0.18.1, unicode-bidi 0.3.15, unicode-general-category 0.6.0, weezl 0.1.8, xmlparser 0.13.6, xmlwriter 0.1.0. Each of them is under the license in its own source on crates.io. Their license texts are not yet collected here; that is done before a build is distributed (see `MAINTAINING.md`).

## License texts

### `ajv` 8.20.0

```
The MIT License (MIT)

Copyright (c) 2015-2021 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `fast-deep-equal` 3.1.3

```
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `json-schema-traverse` 1.0.0

```
MIT License

Copyright (c) 2017 Evgeny Poberezkin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `fast-uri` 3.1.8

```
Copyright (c) 2011-2021, Gary Court until https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae
Copyright (c) 2021-present The Fastify team <https://github.com/fastify/fastify#team>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * The names of any contributors may not be used to endorse or promote
      products derived from this software without specific prior written
      permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS AND CONTRIBUTORS BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

                                  *   *   *

The complete list of contributors can be found at:
- https://github.com/garycourt/uri-js/graphs/contributors
```
