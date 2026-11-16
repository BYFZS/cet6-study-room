# CET6 复习室 Android 版

Android 8.0（API 26）及以上。应用自带词汇训练网页和词库。整卷试题、原始听力和解析由网页的原资料地址在线加载。单词发音使用手机的英语文字转语音引擎。

## 迁移词汇记录

在电脑网页点「导出学习记录」，把 JSON 传到手机。在手机应用点「导入答卷 / 备份」，选择该文件。手机应用和电脑网页各自保存学习进度，换设备时用 JSON 迁移。备份还原会替换当前设备的词汇学习记录。

## 打包

准备 Python 3、JDK 17 或 21、Android SDK Platform 35 和 Build Tools 35.0.0。设置 `JAVA_HOME` 与 `ANDROID_HOME` 后运行：

```sh
python android/build.py
```

也可通过 `--java-home`、`--sdk` 和 `--output` 指定路径。脚本将网页文件从 `dist/` 复制到包内，生成 APK 并校验签名和对齐。初次打包会在本地 `.signing/` 下创建签名密钥和密码；以后覆盖安装需要沿用同一把密钥并提高 `AndroidManifest.xml` 中的版本号。请把签名文件和密码保存在仓库之外的备份中。
