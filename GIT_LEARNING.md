# Git 学习记录

> 从当前 `personal-site` 项目出发，记录已经做过的操作、常用命令和后续练习。
> 本文中的历史记录是已完成的操作；“后续练习”中的命令尚未执行。

## 1. 先理解三个区域

| 区域 | 作用 | 当前项目中的例子 |
| --- | --- | --- |
| 工作区（Working tree） | 存放当前可编辑的文件 | 修改 `preview.html` 中的导航 |
| 暂存区（Index） | 保存准备放入下一次提交的文件内容 | 执行 `git add preview.html` |
| 本地仓库（Repository） | 保存已提交的版本和历史 | 执行 `git commit` 后生成一个提交 |

基本流程：

```text
编辑文件 → git add → git commit
  工作区      暂存区       本地仓库
```

**`git add` 保存的是执行命令那一刻的内容。** 如果暂存后又修改文件，需要再次 `git add`，才能把新的修改也放入这次提交。

## 2. 已完成的学习：初始化与提交

### 2026-10-01：初始化本地仓库

在 PowerShell 中进入项目目录：

```powershell
Set-Location E:\astra\project\personal-site
git init -b main
```

- `git init` 创建 `.git` 目录，开始记录项目版本。
- `-b main` 指定初始分支名为 `main`。
- 初始化不会自动提交文件，也不会自动上传到 GitHub。
- 当前项目已经初始化，日常工作直接使用 `git status` 检查状态即可。

### 2026-10-01：完成第一次提交

```powershell
git status
git add .gitignore README.md app.js index.html package.json preview.html server.mjs style.css
git commit -m "feat: 新增网页预览与 Git 工作台"
git status
```

这里的中文提交信息是按现在的项目约定写出的示例。实际首次提交为：

```text
9615a44  Initial commit: add local web and Git workbench
```

理解要点：

- `git status` 用来检查哪些文件未跟踪、已修改或已暂存。
- `git add 文件名` 明确选择要提交的文件。
- `git commit -m "说明"` 将暂存区内容记录为一个新版本。
- 提交成功后，未提交的改动为空，称为“工作区干净”。
- Git 中的提交作者由 `user.name` 和 `user.email` 决定，它们不代表已经登录 GitHub。

查看当前提交身份：

```powershell
git config user.name
git config user.email
```

## 3. 已完成的学习：两个独立分支

### 分支是什么

分支可以理解为一条命名的开发路线，实际是指向某个提交的引用。

在同一个项目目录中切换分支时，Git 会更新工作区，使文件对应目标分支的版本。`HEAD` 表示当前检出的分支或提交。

### 本项目的分支目标

| 分支 | 用途 |
| --- | --- |
| `main` | 保留初始工作台版本 |
| `A` | 增加“联系我”区域和导航入口；也保存后续项目文档 |
| `B` | 增加深色模式和主题切换按钮 |

两个功能分支都从 `main` 出发，创建命令分别为：

```powershell
git switch -c A main
git switch -c B main
```

**这两条是历史操作示例，不要在当前项目中重复执行：`A`、`B` 已经存在。**

- `-c` 表示创建新分支并切换过去。
- 命令末尾的 `main` 指定共同起点。
- 如果创建 `B` 时省略 `main`，而当前在 `A`，`B` 就会从当前 `A` 的位置出发。

### 创建本文前的提交关系

```text
                   e2c0aa9 → 5dea3e1  A
                  /
9615a44  main ────┤
                  \
                   db4f90d            B
```

| 提交 | 内容 |
| --- | --- |
| `9615a44` | 初始网页与 Git 工作台 |
| `e2c0aa9` | 联系区域和导航入口 |
| `db4f90d` | 深色模式和主题切换 |
| `5dea3e1` | 项目协作约定与阶段性进展记录 |

### 查看和切换分支

```powershell
git branch
git status
git switch A
git switch B
git switch main
```

- `git branch` 中带 `*` 的是当前分支。
- 修改和提交前先确认当前分支，避免把功能提交到错误的位置。
- 切换分支不会自动保存未提交的修改；有些修改会被带到目标分支，有些会阻止切换。先检查状态，明确处理这些修改。
- 本文、`AGENTS.md` 和 `PROCESS.md` 在 `A` 分支中。切换到尚未包含它们的分支时，这些文件会随工作区版本变化而暂时消失。
- 本地网页服务读取的是当前工作区。切换分支后，刷新左侧网页预览即可查看对应页面；右侧 Git 状态会自动更新。

## 4. 日常修改的最小流程

例如，在 `A` 分支更新联系方式：

```powershell
git switch A
git status
# 编辑 preview.html
git diff
git add preview.html
git diff --cached
git commit -m "feat: 补充联系信息"
git status
```

以上是假设性的后续操作，当前联系方式仍未提供。

| 命令 | 主要用途 |
| --- | --- |
| `git status --short --branch` | 简洁查看当前分支和文件状态 |
| `git diff` | 查看已跟踪文件中尚未暂存的修改 |
| `git diff --cached` | 查看已经暂存、准备提交的修改 |
| `git log --oneline` | 简洁查看当前分支的提交历史 |
| `git log --all --graph --oneline --decorate` | 查看所有本地分支的提交关系 |
| `git show --stat HEAD` | 查看最新提交改动了哪些文件 |
| `git remote -v` | 查看配置的远程仓库地址 |

`git diff` 默认不展示未跟踪文件的内容；新文件可以先查看文件本身，暂存后再用 `git diff --cached` 检查。

### 简短状态怎么读

```text
?? GIT_LEARNING.md  新文件，尚未被 Git 跟踪
 M preview.html     已跟踪文件有修改，尚未暂存
M  preview.html     修改已暂存
MM preview.html     有已暂存的修改，暂存后又产生了新的修改
```

两列状态中，第一列反映暂存区，第二列反映工作区。

## 5. 本项目的提交信息约定

采用 `类型: 中文说明` 格式：

```text
feat: 新增联系区域
fix: 修复主题切换后的按钮文案
docs: 新增 Git 学习记录
style: 调整导航间距
refactor: 整理主题切换逻辑
```

- 一次提交围绕一个清晰的修改目的。
- 提交前用 `git diff --cached` 检查实际内容。
- 文件名写清楚，优先使用 `git add 文件名`；`git add .` 会暂存当前目录及其子目录中的全部改动。
- `.gitignore` 用来忽略日志、输出文件等；它不会自动停止跟踪已经提交过的文件。

## 6. 后续练习：在练习分支合并 A 与 B

> 下面只是学习步骤。本次没有执行合并，也没有修改 `main`。

确认工作区干净后，从 `A` 创建练习分支，再合并 `B`：

```powershell
git switch -c practice/merge A
git merge B
```

这样尝试合并的是 `practice/merge`，而 `A`、`B` 和 `main` 原有的分支位置不会因此改变。

两项功能都修改了 `preview.html` 的导航，同一处修改可能产生冲突。冲突意味着 Git 无法自动决定要保留哪些内容，需要人工组合“联系我”入口和主题切换按钮。

若发生冲突：

1. 用 `git status` 查看冲突文件。
2. 打开文件，处理 `<<<<<<<`、`=======`、`>>>>>>>` 标记，保留需要的内容。
3. 检查网页效果后，执行 `git add preview.html`。
4. 执行 `git commit -m "feat: 合并联系区域与深色模式"` 完成合并。

如果希望取消尚在进行中的合并：

```powershell
git merge --abort
```

只有合并仍在进行中时，才使用这条命令。如果没有冲突，`git merge B` 可能已经自动完成提交，应先查看 `git status` 和日志。

## 7. 学习进度

- [x] 记录工作区、暂存区和本地仓库的区别。
- [x] 初始化仓库并完成提交。
- [x] 从共同起点创建两个独立功能分支。
- [x] 通过网页查看 Git 状态。
- [ ] 自己完成一次“修改 → 检查 → 暂存 → 提交”。
- [ ] 在练习分支合并 A 和 B，理解合并冲突。
- [ ] 按需要学习远程仓库、`push` 和 `pull`。

完成新练习后，在本文末尾记录日期、执行命令、观察到的结果，以及还不理解的问题。
