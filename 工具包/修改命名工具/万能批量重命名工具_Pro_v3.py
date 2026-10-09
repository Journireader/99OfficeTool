import os
import re
import shutil
import tkinter as tk
from tkinter import filedialog, messagebox, ttk


class BatchRenamerPro:
    COPY_MODE = "复制并重命名"
    RENAME_MODE = "原地重命名"

    def __init__(self, root):
        self.root = root
        self.root.title("万能批量重命名工具 Pro v3.0")
        self.root.geometry("1000x760")
        self.root.minsize(900, 680)

        self.source = tk.StringVar()
        self.output = tk.StringVar()
        self.replace_old = tk.StringVar()
        self.replace_new = tk.StringVar()
        self.remove_words = tk.StringVar()
        self.prefix = tk.StringVar()
        self.suffix = tk.StringVar()
        self.recursive = tk.BooleanVar(value=True)
        self.operation = tk.StringVar(value=self.COPY_MODE)
        self.scan_status = tk.StringVar(value="尚未扫描")
        self.scanned_files = {}

        self.copy_source = tk.StringVar()
        self.copy_output = tk.StringVar()
        self.copy_template = tk.StringVar(value="MageEquip_Img_Weapon_1#0")
        self.copy_count = tk.StringVar(value="10")
        self.copy_start = tk.StringVar()
        self.copy_step = tk.StringVar(value="1")
        self.keep_extension = tk.BooleanVar(value=True)
        self.collision_mode = tk.StringVar(value="自动避让")

        self.create_ui()

    def create_ui(self):
        title = ttk.Label(
            self.root,
            text="万能批量重命名工具 Pro v3.0",
            font=("Microsoft YaHei UI", 16, "bold"),
        )
        title.pack(pady=(12, 6))

        notebook = ttk.Notebook(self.root)
        notebook.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        rename_tab = ttk.Frame(notebook, padding=10)
        copy_tab = ttk.Frame(notebook, padding=10)
        notebook.add(rename_tab, text="扫描并批量重命名")
        notebook.add(copy_tab, text="单文件批量复制")

        self.create_rename_tab(rename_tab)
        self.create_copy_tab(copy_tab)

    def create_rename_tab(self, parent):
        path_box = ttk.LabelFrame(parent, text="扫描范围", padding=8)
        path_box.pack(fill="x")
        self.path_row(path_box, 0, "源文件夹", self.source, self.select_source)
        self.path_row(path_box, 1, "输出文件夹", self.output, self.select_output)

        option_row = ttk.Frame(path_box)
        option_row.grid(row=2, column=1, sticky="w", pady=(5, 0))
        ttk.Checkbutton(
            option_row, text="包含所有子文件夹", variable=self.recursive
        ).pack(side="left", padx=(0, 20))
        ttk.Label(option_row, text="处理方式").pack(side="left")
        operation_box = ttk.Combobox(
            option_row,
            textvariable=self.operation,
            values=(self.COPY_MODE, self.RENAME_MODE),
            state="readonly",
            width=14,
        )
        operation_box.pack(side="left", padx=6)
        operation_box.bind("<<ComboboxSelected>>", self.on_operation_changed)
        ttk.Button(path_box, text="扫描文件", command=self.scan_files).grid(
            row=2, column=2, padx=5, pady=(5, 0)
        )

        rule_box = ttk.LabelFrame(parent, text="重命名规则", padding=8)
        rule_box.pack(fill="x", pady=8)
        labels = (
            ("替换原文字", self.replace_old),
            ("替换为", self.replace_new),
            ("删除文字（逗号分隔）", self.remove_words),
            ("添加前缀", self.prefix),
            ("添加后缀", self.suffix),
        )
        for index, (label, variable) in enumerate(labels):
            row = index // 2
            column = (index % 2) * 2
            ttk.Label(rule_box, text=label).grid(
                row=row, column=column, sticky="e", padx=(4, 6), pady=4
            )
            ttk.Entry(rule_box, textvariable=variable, width=31).grid(
                row=row, column=column + 1, sticky="ew", padx=(0, 12), pady=4
            )
        rule_box.columnconfigure(1, weight=1)
        rule_box.columnconfigure(3, weight=1)

        list_box = ttk.LabelFrame(
            parent, text="文件列表（可用 Ctrl / Shift 批量选择）", padding=8
        )
        list_box.pack(fill="both", expand=True)

        toolbar = ttk.Frame(list_box)
        toolbar.pack(fill="x", pady=(0, 6))
        ttk.Button(toolbar, text="全选", command=self.select_all).pack(side="left")
        ttk.Button(toolbar, text="取消全选", command=self.select_none).pack(
            side="left", padx=5
        )
        ttk.Button(toolbar, text="反选", command=self.invert_selection).pack(
            side="left"
        )
        ttk.Button(toolbar, text="刷新预览", command=self.refresh_preview).pack(
            side="left", padx=(15, 5)
        )
        ttk.Button(toolbar, text="执行所选项目", command=self.execute_selected).pack(
            side="left"
        )
        ttk.Label(toolbar, textvariable=self.scan_status).pack(side="right")

        tree_frame = ttk.Frame(list_box)
        tree_frame.pack(fill="both", expand=True)
        self.file_tree = ttk.Treeview(
            tree_frame,
            columns=("old", "new", "folder"),
            show="headings",
            selectmode="extended",
        )
        self.file_tree.heading("old", text="原文件名")
        self.file_tree.heading("new", text="新文件名")
        self.file_tree.heading("folder", text="相对文件夹")
        self.file_tree.column("old", width=260, anchor="w")
        self.file_tree.column("new", width=300, anchor="w")
        self.file_tree.column("folder", width=260, anchor="w")
        scrollbar = ttk.Scrollbar(
            tree_frame, orient="vertical", command=self.file_tree.yview
        )
        self.file_tree.configure(yscrollcommand=scrollbar.set)
        self.file_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        self.file_tree.bind("<<TreeviewSelect>>", self.update_selection_status)

    def create_copy_tab(self, parent):
        source_box = ttk.LabelFrame(parent, text="复制设置", padding=10)
        source_box.pack(fill="x")
        self.path_row(
            source_box, 0, "源文件", self.copy_source, self.select_copy_source, file=True
        )
        self.path_row(
            source_box, 1, "输出文件夹", self.copy_output, self.select_copy_output
        )

        ttk.Label(source_box, text="命名模板").grid(
            row=2, column=0, sticky="e", padx=5, pady=6
        )
        ttk.Entry(
            source_box, textvariable=self.copy_template, width=70
        ).grid(row=2, column=1, sticky="ew", padx=5, pady=6)
        ttk.Label(
            source_box,
            text="支持 MageEquip_Img_Weapon_1#0 或 MageEquip_Img_Weapon_{n}#0",
            foreground="#666666",
        ).grid(row=3, column=1, sticky="w", padx=5)

        number_row = ttk.Frame(source_box)
        number_row.grid(row=4, column=1, sticky="w", padx=5, pady=10)
        ttk.Label(number_row, text="复制数量").pack(side="left")
        ttk.Entry(number_row, textvariable=self.copy_count, width=8).pack(
            side="left", padx=(5, 18)
        )
        ttk.Label(number_row, text="起始编号").pack(side="left")
        ttk.Entry(number_row, textvariable=self.copy_start, width=8).pack(
            side="left", padx=5
        )
        ttk.Label(number_row, text="（留空则从模板数字开始）").pack(side="left")
        ttk.Label(number_row, text="步长").pack(side="left", padx=(18, 0))
        ttk.Entry(number_row, textvariable=self.copy_step, width=7).pack(
            side="left", padx=5
        )

        option_row = ttk.Frame(source_box)
        option_row.grid(row=5, column=1, sticky="w", padx=5, pady=(0, 8))
        ttk.Checkbutton(
            option_row, text="保留源文件扩展名", variable=self.keep_extension
        ).pack(side="left")
        ttk.Label(option_row, text="文件重名时").pack(side="left", padx=(22, 5))
        ttk.Combobox(
            option_row,
            textvariable=self.collision_mode,
            values=("自动避让", "跳过", "覆盖"),
            state="readonly",
            width=10,
        ).pack(side="left")
        source_box.columnconfigure(1, weight=1)

        action_row = ttk.Frame(parent)
        action_row.pack(fill="x", pady=10)
        ttk.Button(
            action_row, text="预览连续文件名", command=self.preview_copies
        ).pack(side="left")
        ttk.Button(
            action_row, text="开始批量复制", command=self.execute_copies
        ).pack(side="left", padx=8)

        preview_box = ttk.LabelFrame(parent, text="复制预览", padding=8)
        preview_box.pack(fill="both", expand=True)
        self.copy_tree = ttk.Treeview(
            preview_box, columns=("index", "filename", "state"), show="headings"
        )
        self.copy_tree.heading("index", text="序号")
        self.copy_tree.heading("filename", text="目标文件名")
        self.copy_tree.heading("state", text="当前状态")
        self.copy_tree.column("index", width=80, anchor="center")
        self.copy_tree.column("filename", width=620, anchor="w")
        self.copy_tree.column("state", width=130, anchor="center")
        copy_scrollbar = ttk.Scrollbar(
            preview_box, orient="vertical", command=self.copy_tree.yview
        )
        self.copy_tree.configure(yscrollcommand=copy_scrollbar.set)
        self.copy_tree.pack(side="left", fill="both", expand=True)
        copy_scrollbar.pack(side="right", fill="y")

    @staticmethod
    def path_row(parent, row, name, variable, command, file=False):
        ttk.Label(parent, text=name).grid(
            row=row, column=0, sticky="e", padx=5, pady=5
        )
        ttk.Entry(parent, textvariable=variable, width=78).grid(
            row=row, column=1, sticky="ew", padx=5, pady=5
        )
        ttk.Button(parent, text="选择文件" if file else "选择", command=command).grid(
            row=row, column=2, padx=5, pady=5
        )
        parent.columnconfigure(1, weight=1)

    def select_source(self):
        path = filedialog.askdirectory(title="选择要扫描的文件夹")
        if path:
            self.source.set(path)
            if not self.output.get():
                self.output.set(path)

    def select_output(self):
        path = filedialog.askdirectory(title="选择输出文件夹")
        if path:
            self.output.set(path)

    def select_copy_source(self):
        path = filedialog.askopenfilename(title="选择要批量复制的源文件")
        if path:
            self.copy_source.set(path)
            if not self.copy_output.get():
                self.copy_output.set(os.path.dirname(path))

    def select_copy_output(self):
        path = filedialog.askdirectory(title="选择复制输出文件夹")
        if path:
            self.copy_output.set(path)

    def on_operation_changed(self, _event=None):
        if self.operation.get() == self.RENAME_MODE:
            self.output.set("")

    def new_name(self, filename):
        name, extension = os.path.splitext(filename)
        if self.replace_old.get():
            name = name.replace(self.replace_old.get(), self.replace_new.get())
        for word in self.remove_words.get().replace("，", ",").split(","):
            word = word.strip()
            if word:
                name = name.replace(word, "")
        name = f"{self.prefix.get()}{name}{self.suffix.get()}"
        return name + extension

    def iter_source_files(self, source):
        if self.recursive.get():
            for folder, _directories, files in os.walk(source):
                for filename in files:
                    yield os.path.join(folder, filename)
        else:
            with os.scandir(source) as entries:
                for entry in entries:
                    if entry.is_file():
                        yield entry.path

    def scan_files(self):
        source = self.source.get().strip()
        if not source or not os.path.isdir(source):
            messagebox.showerror("无法扫描", "请选择一个有效的源文件夹。")
            return

        self.file_tree.delete(*self.file_tree.get_children())
        self.scanned_files.clear()
        try:
            files = sorted(self.iter_source_files(source), key=str.lower)
        except OSError as error:
            messagebox.showerror("扫描失败", str(error))
            return

        for index, path in enumerate(files):
            relative_folder = os.path.relpath(os.path.dirname(path), source)
            if relative_folder == ".":
                relative_folder = "（根目录）"
            item_id = f"file_{index}"
            self.scanned_files[item_id] = path
            self.file_tree.insert(
                "",
                "end",
                iid=item_id,
                values=(
                    os.path.basename(path),
                    self.new_name(os.path.basename(path)),
                    relative_folder,
                ),
            )
        self.select_all()
        self.update_selection_status()

    def refresh_preview(self):
        if not self.scanned_files:
            self.scan_files()
            return
        for item_id, path in self.scanned_files.items():
            values = list(self.file_tree.item(item_id, "values"))
            values[1] = self.new_name(os.path.basename(path))
            self.file_tree.item(item_id, values=values)
        self.update_selection_status()

    def select_all(self):
        items = self.file_tree.get_children()
        self.file_tree.selection_set(items)
        self.update_selection_status()

    def select_none(self):
        self.file_tree.selection_remove(self.file_tree.selection())
        self.update_selection_status()

    def invert_selection(self):
        selected = set(self.file_tree.selection())
        for item in self.file_tree.get_children():
            if item in selected:
                self.file_tree.selection_remove(item)
            else:
                self.file_tree.selection_add(item)
        self.update_selection_status()

    def update_selection_status(self, _event=None):
        total = len(self.file_tree.get_children())
        selected = len(self.file_tree.selection())
        self.scan_status.set(f"已扫描 {total} 个文件，已选择 {selected} 个")

    def destination_for(self, source_path):
        new_filename = self.new_name(os.path.basename(source_path))
        if self.operation.get() == self.RENAME_MODE:
            return os.path.join(os.path.dirname(source_path), new_filename)
        relative_folder = os.path.relpath(
            os.path.dirname(source_path), self.source.get().strip()
        )
        return os.path.normpath(
            os.path.join(self.output.get().strip(), relative_folder, new_filename)
        )

    def execute_selected(self):
        selected = self.file_tree.selection()
        if not selected:
            messagebox.showwarning("没有选择", "请先在文件列表中选择要处理的文件。")
            return
        if self.operation.get() == self.COPY_MODE:
            output = self.output.get().strip()
            if not output:
                messagebox.showerror("缺少输出位置", "请选择输出文件夹。")
                return
        action = "复制并重命名" if self.operation.get() == self.COPY_MODE else "原地重命名"
        if not messagebox.askyesno(
            "确认执行", f"确定要对所选 {len(selected)} 个文件执行“{action}”吗？"
        ):
            return

        completed = 0
        skipped = 0
        failed = []
        for item_id in selected:
            old_path = self.scanned_files.get(item_id)
            if not old_path or not os.path.isfile(old_path):
                skipped += 1
                continue
            new_path = self.destination_for(old_path)
            if os.path.normcase(os.path.abspath(old_path)) == os.path.normcase(
                os.path.abspath(new_path)
            ):
                skipped += 1
                continue
            try:
                os.makedirs(os.path.dirname(new_path), exist_ok=True)
                if os.path.exists(new_path):
                    new_path = self.auto_name(new_path)
                if self.operation.get() == self.COPY_MODE:
                    shutil.copy2(old_path, new_path)
                else:
                    os.rename(old_path, new_path)
                completed += 1
            except OSError as error:
                failed.append(f"{os.path.basename(old_path)}：{error}")

        details = f"处理完成：成功 {completed} 个，跳过 {skipped} 个，失败 {len(failed)} 个。"
        if failed:
            messagebox.showwarning("部分项目未完成", details + "\n\n" + "\n".join(failed[:8]))
        else:
            messagebox.showinfo("完成", details)
        self.scan_files()

    def copy_parameters(self):
        source = self.copy_source.get().strip()
        output = self.copy_output.get().strip()
        template = self.copy_template.get().strip()
        if not source or not os.path.isfile(source):
            raise ValueError("请选择一个有效的源文件。")
        if not output:
            raise ValueError("请选择输出文件夹。")
        if not template:
            raise ValueError("请输入命名模板。")
        try:
            count = int(self.copy_count.get())
            step = int(self.copy_step.get())
        except ValueError:
            raise ValueError("复制数量和步长必须是整数。")
        if not 1 <= count <= 10000:
            raise ValueError("复制数量必须在 1 到 10000 之间。")
        if step == 0:
            raise ValueError("步长不能为 0。")
        start_text = self.copy_start.get().strip()
        if start_text:
            try:
                start = int(start_text)
            except ValueError:
                raise ValueError("起始编号必须是整数，或留空自动识别。")
        else:
            start = None
        return source, output, template, count, start, step

    def build_copy_names(self):
        source, output, template, count, start, step = self.copy_parameters()
        source_extension = os.path.splitext(source)[1]
        matches = list(re.finditer(r"\d+", template))
        if "{n}" in template:
            match = None
        elif "#" in template:
            hash_position = template.find("#")
            matches_before_hash = [
                number_match
                for number_match in matches
                if number_match.end() <= hash_position
            ]
            match = matches_before_hash[-1] if matches_before_hash else (matches[-1] if matches else None)
        else:
            match = matches[-1] if matches else None
        width = len(match.group(0)) if match else 0
        if start is None:
            start = int(match.group(0)) if match else 1

        names = []
        for offset in range(count):
            number = start + offset * step
            number_text = str(number).zfill(width) if width else str(number)
            if "{n}" in template:
                filename = template.replace("{n}", number_text)
            elif match:
                filename = template[: match.start()] + number_text + template[match.end() :]
            else:
                filename = f"{template}_{number_text}"
            if self.keep_extension.get() and source_extension:
                if not filename.lower().endswith(source_extension.lower()):
                    filename += source_extension
            names.append((filename, os.path.join(output, filename)))
        return source, names

    def preview_copies(self):
        self.copy_tree.delete(*self.copy_tree.get_children())
        try:
            _source, names = self.build_copy_names()
        except ValueError as error:
            messagebox.showerror("无法预览", str(error))
            return
        for index, (filename, path) in enumerate(names, start=1):
            state = "已存在" if os.path.exists(path) else "可创建"
            self.copy_tree.insert("", "end", values=(index, filename, state))

    def execute_copies(self):
        try:
            source, names = self.build_copy_names()
        except ValueError as error:
            messagebox.showerror("无法复制", str(error))
            return
        if not messagebox.askyesno(
            "确认批量复制", f"将从一个源文件创建 {len(names)} 个副本，是否继续？"
        ):
            return

        completed = 0
        skipped = 0
        failed = []
        os.makedirs(self.copy_output.get().strip(), exist_ok=True)
        for filename, destination in names:
            try:
                if os.path.exists(destination):
                    if self.collision_mode.get() == "跳过":
                        skipped += 1
                        continue
                    if self.collision_mode.get() == "自动避让":
                        destination = self.auto_name(destination)
                shutil.copy2(source, destination)
                completed += 1
            except OSError as error:
                failed.append(f"{filename}：{error}")

        self.preview_copies()
        details = f"复制完成：成功 {completed} 个，跳过 {skipped} 个，失败 {len(failed)} 个。"
        if failed:
            messagebox.showwarning("部分文件未完成", details + "\n\n" + "\n".join(failed[:8]))
        else:
            messagebox.showinfo("完成", details)

    @staticmethod
    def auto_name(path):
        base, extension = os.path.splitext(path)
        index = 1
        candidate = path
        while os.path.exists(candidate):
            candidate = f"{base}_{index:03d}{extension}"
            index += 1
        return candidate


if __name__ == "__main__":
    root = tk.Tk()
    BatchRenamerPro(root)
    root.mainloop()
