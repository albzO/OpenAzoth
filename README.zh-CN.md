# Crateless

[English](README.md) · **中文**

**打开使用：** https://albzo.github.io/Crateless/

> 不装全家桶，也能设置你的 ROG Azoth。

Crateless 是一个**纯网页**的 ROG Azoth 设置工具：打开网页、点“连接键盘”，就能改灯效、OLED 屏幕、按键映射和电源设置。不需要安装任何程序，也没有后台常驻服务。

**非官方项目，与 ASUS 无关，也未获其认可。** “ROG”“Azoth”是其各自所有者的商标，这里只用来说明适用的设备。

**支持的设备：** 仅限初代 ROG Azoth（有线、原装 2.4G 接收器或 Omni 接收器）。不支持 Azoth Extreme、Azoth X、Azoth 96 HE。

## 为什么做这个

官方网页设置工具对 Azoth 走“Legacy Mode”，必须先安装电脑端的 Companion 才能改设置。实测 Companion 运行时是 **7 个后台进程、约 136 MB 私有内存**，还带内核过滤驱动和托盘程序。

这些设置本来就存在键盘里，浏览器通过 WebHID 直接发给键盘就够了。

## 功能

| | |
|---|---|
| 灯效 | 全部 10 种效果，选项与官方网页一致（颜色、渐变、背景色、亮度、速度、宽度、方向），改动即时生效 |
| OLED | 内置预设动画、上传 GIF/图片（16 级灰度，最多 196 帧）、自定义横幅、日期时间、开关和亮度 |
| 按键映射 | 把任意键映射成其他键、媒体键或鼠标按键，即时写入 |
| 电源 | 低电量警示、省电模式、休眠时间（当前值从键盘读取） |
| 同步设置 | 把本页记录的设置重新写回键盘（单个 profile 或全部 6 个） |
| 恢复默认 | 恢复灯效、按键映射、单个 profile 或全部 profile 的出厂设置 |
| 状态 | 固件、电量/充电/电压、接收器、当前 profile，实时更新 |
| 语言 | 中文 / English |

**不支持：** 系统信息、音乐频谱、系统通知、软件宏。这些需要电脑端程序持续提供数据，网页做不到。

## 使用

- 浏览器：**桌面版 Chrome 或 Edge**（需要 WebHID）。
- 第一次点“连接键盘”，选择 ROG AZOTH（有线）或 ROG OMNI RECEIVER（无线），之后会自动连接。
- 键盘无法读回按键映射、灯效颜色和 OLED 内容，所以页面会把你的设置存在浏览器里，按键盘（序列号）和 profile 分开记录。

## 开发

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # 协议和图像处理的单元测试
npm run build      # 输出到 dist/
```

```
src/
  hid/            WebHID 传输层（与设备无关）：收发/应答/队列、分包上传、设备发现
  devices/azoth/  Azoth 协议，全部是纯函数：设备信息、灯效、按键、OLED、电源
  media/          图像处理：GIF 解码、16 级灰度、横幅文字排版
  state/          应用状态（@preact/signals）：连接与实时状态、各 profile 设置、操作、同步
  i18n/           中英文词典，以及协议值的显示名称
  ui/             Preact 组件
tests/            单元测试（期望的字节来自真实键盘通信）
tools/            Python 命令行工具、本地素材下载脚本
docs/PROTOCOL.md  协议笔记
```

依赖只朝一个方向：`ui → state → devices → hid`。协议层不碰任何浏览器 API，所以不接键盘也能测试。要加一种语言，在 `src/i18n/en.ts` 旁边加一份词典即可，类型检查会列出缺少的词条。

### 厂商素材

横幅图案和预设动画预览是 ASUS 的素材，**不在这个仓库里**。部署流程会在构建时下载静态图（横幅图案和每个预设的一帧画面）；没有这些文件时，页面会画近似图案。想在本地看完整的动画预览，运行：

```bash
python tools/fetch_rog_banners.py
```

文件会放到 `public/rog-assets/`，这个目录已被 git 忽略。键盘本身始终显示固件里的原版。

## 许可证

MIT
