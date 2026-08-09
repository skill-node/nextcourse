# 字体集 (font-sets)

字体是**独立于配色的一根轴**。配色决定「什么颜色」，字体集决定「什么字」——
两者可以自由组合，`course.meta.md` 里用 `fontset:` 指定，不写则用配色的默认字体集。

每个字体集是一个完整的**配对**：拉丁 Display + 中文 Display + 正文。
之所以整套配对而不是拆成「配色管拉丁、字体集管中文」，是因为衬线/非衬线必须成对——
Archivo Black 配思源宋体是错的，CSS 又没法根据配色自动挑中文字体，只能显式配好。

## 铁律

1. **中文字体必须显式写在栈里。** 拉丁字体没有汉字字形，只写 `'Archivo Black', sans-serif`
   会让中文落到浏览器默认字体，Mac 一套 Windows 一套，不受控。
2. **衬线配衬线，非衬线配非衬线。** 拉丁 Display 是衬线，中文 Display 就得是宋体一路。
3. **禁止 CDN `@import`。** 一律从 `lib/fonts/display/` 引本地文件，见 DESIGN-SYSTEM.md「字体本地化」。

## 现有字体集

| 名称 | 标题 | 正文 | 气质 |
|---|---|---|---|
| `impact-sans` | Archivo Black + 思源黑体 | 思源黑体 | 冲击力、工具/技术培训 |
| `grotesk-sans` | Archivo + 思源黑体 | 思源黑体 | 瑞士网格、理性、战略管理 |
| `voltage-sans` | Syne + 思源黑体 | 思源黑体 | 创意、年轻受众 |
| `modern-sans` | 思源黑体 | 思源黑体 | 现代中性，纯中文场景最稳 |
| `editorial-serif` | 思源宋体 | 思源黑体 | 编辑感、克制、顾问气质（= skillnode 设计系统同款） |
| `garamond-serif` | Cormorant + 思源宋体 | 思源黑体 | 优雅衬线、高端质感 |
| `didone-serif` | Bodoni Moda + 思源宋体 | 思源黑体 | 高对比衬线、时装/品牌感 |
| `system` | 系统字体 | 系统字体 | 零下载，快速预览用 |

思源黑体 = Noto Sans SC，思源宋体 = Noto Serif SC，均为 SIL OFL 开源可变字体。
