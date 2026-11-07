# 第三方许可

根目录 `LICENSE` 的 MIT 只覆盖 2mauis 拥有的 ainews 代码。它不把下列作品改成 MIT。`third-party/` 里的许可证文件是从对应发布物或该注释点名的提交原样复制的。通知测试只核对文件字节和下面的分类用词，不是公开许可门禁已经通过的证明。窗口命中也不写成字节级同一来源。

`src/index.js` 的路径注释给出模块边界：第 28–2016 行是 `node_modules/@mozilla/readability/Readability.js`，第 2017–2079 行是 `Readability-readerable.js`，第 2080–2091 行是 `index.js`，第 2095–12606 行是 `node_modules/linkedom/worker.js`。文件开头的 `__name` / `@__PURE__` 是打包器留下的，但没有这次构建的 esbuild 版本或参数记录。

覆盖数字用的是同一种比较：去掉注释、去掉空白后，以 120 个字符、步长 60 的窗口看源码窗口是否出现在对应区段。`__name(...)` 包装没有从区段里剥掉，所以这是偏低的连续片段覆盖，不是字节级差异证明。

## 已证明

- 特征字符串把该区段对应到 @mozilla/readability 0.6.0。已发布版本 0.3.0 到 0.6.0 里，只有 0.6.0 的 `Readability.js` 同时含有 `@vocab`、`parsely-author`、`parsely-pub-date`、`article:author`、`Checks failed`，且这 5 处都在上面的 readability 区段。0.6.0 的窗口命中是 585/744（0.786），0.5.0 是 351/712（0.493），0.4.4 是 339/704（0.482）。
- 0.6.0 包内有 `LICENSE.md`、没有 `NOTICE`。`third-party/readability/LICENSE.md` 是该文件，版权行为 Copyright (c) 2010 Arc90 Inc。`third-party/readability/APACHE-2.0.txt` 是该文件所指向的 Apache-2.0 全文。
- `Readability-readerable.js` 0.6.0 对第 2017–2079 行的窗口命中是 14/26（0.538）。区段比源文件短，包装后的命中率较低。
- linkedom 在同一比较下，0.18.13 是 1838/4506（0.408），0.18.12 是 1020/4751（0.215），0.18.11 是 1014/4752（0.213），0.18.14 是 1669/6532（0.256）。0.18.13 是这些相邻版本里最高的，但 0.408 不能证明整份 `worker.js` 都在区段里。
- `third-party/linkedom/LICENSE` 是 npm 上 linkedom 0.18.13 的 ISC 文本，版权人 Andrea Giammarchi, @WebReflection。
- XRegExp：linkedom `worker.js` 的注释指向 `slevithan/xregexp` 提交 `95eeebeb8fac8754d54eafe2b4743661ac1cf028` 的 `src/xregexp.js` 第 794 行。该行原文是 `XRegExp.escape`，正则字符类为 `/[-\[\]{}()*+?.,\\^$|#\s]/g`。bundle 里的 `reChars` 是 `/[-[\]{}()*+?.,\\^$|#\s]/g`，字符类转义不完全相同。复制范围是这一条字符类和那条署名注释，不是整个 XRegExp。`third-party/xregexp/LICENSE` 是该提交的 MIT 全文，版权行为 Copyright (c) 2007-present Steven Levithan。只留注释不等于已经附上 MIT 要求的许可声明，所以补上该提交的许可证，而不另判这段摘录是否构成 substantial portion。
- `pkauth.lock.json` 固定 passkey-demo 提交 `89a9453346369e7853c09b93982f8223b863a9e9`。该提交根目录 `LICENSE` 的 sha256 是 `80cbd1f2f9a6d82d743799447588d0caa64a51c0eb04c3a9929b067e2f1ae806`，与锁一致。`third-party/passkey-demo/LICENSE` 是这份文本。`vendor/` 不在本源码包中。

## 推断

- 打包器是 esbuild 一类会写 `__name` 和 `node_modules/...` 路径注释的工具。没有构建日志，不能把推断写成一次成功的重建。
- 已发布的 linkedom 0.18.13 `worker.js` 自己内嵌了 htmlparser2、css-select、cssom、uhyphen 的代码或注释。bundle 区段里能看到对应的错误字符串和 `uhyphen`。因此这些名字出现在区段中是跟随这份 `worker.js`，不是另一次 npm 安装证明的。
- `linkedom@0.18.13` 的 package.json 直接依赖在登记范围内各只有一个已发布版本：`htmlparser2@10.1.0`、`css-select@7.0.0`、`cssom@0.5.0`、`html-escaper@3.0.3`、`uhyphen@0.2.0`。这是登记范围推出来的版本，不是当时构建的 lockfile。传递依赖里许可证文件字节相同的，`third-party/manifest.json` 只收一份。版权行按许可证原文保留。

## 未知

- 产生 `src/index.js` 的 esbuild 版本、参数和当时的 `node_modules` lockfile。
- linkedom 区段与 0.18.13 `worker.js` 之间未命中的连续窗口具体是变换、删减还是另一份源码。在没有构建记录时，不能把 0.18.13 说成已经逐模块证完。
- 若要改成可复验的来源，最小做法是在以后的单独变更里用锁定的 `@mozilla/readability@0.6.0` 和 `linkedom@0.18.13` 重新打包，并保存构建命令。那会改动 `src/index.js` 的字节，可能改变解析行为，所以这次不替换实现、不丢现有功能。
