import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, setIcon, TFolder, TFile } from 'obsidian';
import { Extension, StateField, StateEffect, RangeSetBuilder, Transaction } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view";

interface SelectSectionSettings {
    alwaysShowIcons: boolean;
    includeHeader: boolean;
    showSelectButton: boolean;
    showCopyButton: boolean;
    showSelectHeaderButton: boolean;
    compactButtons: boolean;
}

const DEFAULT_SETTINGS: SelectSectionSettings = {
    alwaysShowIcons: false,
    includeHeader: true,
    showSelectButton: true,
    showCopyButton: true,
    showSelectHeaderButton: true,
    compactButtons: false
}

export default class SelectSectionPlugin extends Plugin {
    settings: SelectSectionSettings;

    async onload() {
        await this.loadSettings();
        this.refreshBodyClass();

        // Register CodeMirror extension for Live Preview
        this.registerEditorExtension(selectSectionExtension(this));

        // Register MarkdownPostProcessor for Reading View
        this.registerMarkdownPostProcessor((element, context) => {
            const headers = element.querySelectorAll("h1, h2, h3, h4, h5, h6");
            headers.forEach((header) => {
                this.addIconsToHeader(header as HTMLElement, context);
            });
        });

        this.addSettingTab(new SelectSectionSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file instanceof TFolder) {
                    menu.addItem((item) => {
                        item
                            .setTitle("Merge Folder Notes")
                            .setIcon("documents")
                            .onClick(async () => {
                                await this.mergeFolderNotes(file);
                            });
                    });

                    menu.addItem((item) => {
                        item
                            .setTitle("Merge Some Folder Notes")
                            .setIcon("list-checks")
                            .onClick(async () => {
                                await this.mergeSomeFolderNotes(file);
                            });
                    });
                }
            })
        );
    }

    async mergeFolderNotes(folder: TFolder) {
        const files = folder.children
            .filter((file): file is TFile => file instanceof TFile && file.extension === "md")
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (files.length === 0) {
            new Notice("No markdown files found in this folder.");
            return;
        }

        await this.performMerge(folder, files);
    }

    async mergeSomeFolderNotes(folder: TFolder) {
        const files = folder.children
            .filter((file): file is TFile => file instanceof TFile && file.extension === "md")
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        if (files.length === 0) {
            new Notice("No markdown files found in this folder.");
            return;
        }

        new MergeNotesModal(this.app, files, async (selectedFiles) => {
            await this.performMerge(folder, selectedFiles);
        }).open();
    }

    async performMerge(folder: TFolder, files: TFile[]) {
        let mergedContent = "";
        for (const file of files) {
            const content = await this.app.vault.read(file);
            if (mergedContent.length > 0) {
                mergedContent += "\n\n";
            }
            mergedContent += content;
        }

        let fileName = folder.name;
        let filePath = `${folder.path}/${fileName}.md`;
        let counter = 1;

        while (this.app.vault.getAbstractFileByPath(filePath)) {
            filePath = `${folder.path}/${fileName} ${counter}.md`;
            counter++;
        }

        try {
            await this.app.vault.create(filePath, mergedContent);
            new Notice(`Merged ${files.length} notes into ${filePath.split('/').pop()}`);
        } catch (error) {
            console.error("Error merging notes:", error);
            new Notice("Failed to merge notes. See console for details.");
        }
    }

    onunload() {
        document.body.removeClass("select-section-always-show");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.refreshBodyClass();
        // Trigger a refresh of the views to apply setting changes
        this.app.workspace.updateOptions();
    }

    refreshBodyClass() {
        if (this.settings.alwaysShowIcons) {
            document.body.addClass("select-section-always-show");
        } else {
            document.body.removeClass("select-section-always-show");
        }

        if (this.settings.compactButtons) {
            document.body.addClass("select-section-compact-mode");
        } else {
            document.body.removeClass("select-section-compact-mode");
        }

        if (this.settings.showSelectButton) {
            document.body.addClass("select-section-show-select");
        } else {
            document.body.removeClass("select-section-show-select");
        }

        if (this.settings.showCopyButton) {
            document.body.addClass("select-section-show-copy");
        } else {
            document.body.removeClass("select-section-show-copy");
        }

        if (this.settings.showSelectHeaderButton) {
            document.body.addClass("select-section-show-select-header");
        } else {
            document.body.removeClass("select-section-show-select-header");
        }
    }

    addIconsToHeader(header: HTMLElement, context: MarkdownPostProcessorContext) {
        // Avoid adding duplicate icons
        if (header.querySelector(".select-section-container")) return;

        const container = document.createElement("span");
        container.addClass("select-section-container");
        // Body class handles visibility now

        // Unified DOM Structure
        // We always create the "compact" structure: Container -> [Trigger, ActionsContainer -> [Select, Copy]]
        // CSS will handle showing/hiding the trigger and positioning the actions based on the body class.

        container.addClass("select-section-compact"); // Always add this class for consistent styling hooks

        const triggerBtn = container.createSpan({ cls: "select-section-btn select-section-compact-trigger" });
        setIcon(triggerBtn, "more-horizontal");
        triggerBtn.ariaLabel = "Show Actions";

        const actionsContainer = container.createSpan({ cls: "select-section-compact-actions" });

        triggerBtn.onclick = (e) => {
            e.stopPropagation();
            // Only toggle if we are effectively in compact mode (checked via body class or just always toggle and let CSS hide it if not needed)
            // Actually, if the trigger is visible (handled by CSS), clicking it should toggle.
            actionsContainer.classList.toggle("show");
        };

        // Close when clicking outside
        document.addEventListener("click", (e) => {
            if (!container.contains(e.target as Node)) {
                actionsContainer.removeClass("show");
            }
        });

        this.createActionButtons(actionsContainer, header, context);

        header.appendChild(container);
    }

    createActionButtons(container: HTMLElement, header: HTMLElement, context: MarkdownPostProcessorContext) {
        // Always create buttons, visibility controlled by CSS
        const selectBtn = container.createSpan({ cls: "select-section-btn select-section-btn-select" });
        setIcon(selectBtn, "mouse-pointer-click");
        selectBtn.ariaLabel = "Select and Copy Section";
        selectBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleSelect(header, context);
        };

        const copyBtn = container.createSpan({ cls: "select-section-btn select-section-btn-copy" });
        setIcon(copyBtn, "copy");
        copyBtn.ariaLabel = "Copy Section";
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleCopy(header, context);
        };

        const selectHeaderBtn = container.createSpan({ cls: "select-section-btn select-section-btn-select-header" });
        setIcon(selectHeaderBtn, "heading");
        selectHeaderBtn.ariaLabel = "Select Header Title Only";
        selectHeaderBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleSelectHeader(header, context);
        };
    }

    // Logic for Reading View Selection/Copy
    handleSelectHeader(header: HTMLElement, context: MarkdownPostProcessorContext) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const sectionInfo = context.getSectionInfo(header);
            if (sectionInfo) {
                this.selectHeaderOnly(view.editor, sectionInfo.lineStart);
            }
        }
    }
    handleSelect(header: HTMLElement, context: MarkdownPostProcessorContext) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const sectionInfo = context.getSectionInfo(header);
            if (sectionInfo) {
                this.selectOrCopySection(view.editor, sectionInfo.lineStart, true);
            }
        }
    }

    handleCopy(header: HTMLElement, context: MarkdownPostProcessorContext) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const sectionInfo = context.getSectionInfo(header);
            if (sectionInfo) {
                this.selectOrCopySection(view.editor, sectionInfo.lineStart, false, true);
            }
        }
    }

    // Core Logic for Selection/Copy
    selectOrCopySection(editor: Editor, headerLine: number, select: boolean, copy: boolean = false) {
        const lineCount = editor.lineCount();
        const headerText = editor.getLine(headerLine);

        // Determine header level
        const match = headerText.match(/^(#+)\s/);
        if (!match) return;
        const level = match[1].length;

        let endLine = lineCount - 1;

        // Find next header of same or higher level
        for (let i = headerLine + 1; i < lineCount; i++) {
            const line = editor.getLine(i);
            const nextMatch = line.match(/^(#+)\s/);
            if (nextMatch) {
                const nextLevel = nextMatch[1].length;
                if (nextLevel <= level) {
                    endLine = i - 1;
                    break;
                }
            }
        }

        let startLine = headerLine;
        if (!this.settings.includeHeader) {
            startLine++;
        }

        // Adjust endLine to exclude trailing empty lines if desired, but standard behavior usually includes them until next section.

        if (startLine > endLine) {
            // Empty section or header only
            if (this.settings.includeHeader) {
                endLine = startLine;
            } else {
                return; // Nothing to select
            }
        }

        const rangeStart = { line: startLine, ch: 0 };
        const rangeEnd = { line: endLine, ch: editor.getLine(endLine).length };

        if (select) {
            editor.setSelection(rangeStart, rangeEnd);
            // Scroll into view
            editor.scrollIntoView({ from: rangeStart, to: rangeEnd });
        }

        if (copy) {
            const textToCopy = editor.getRange(rangeStart, rangeEnd);
            navigator.clipboard.writeText(textToCopy).then(() => {
                new Notice("Section copied to clipboard!");
            });
        }
    }

    selectHeaderOnly(editor: Editor, headerLine: number) {
        const headerText = editor.getLine(headerLine);
        const match = headerText.match(/^(#+)\s+(.*)$/);

        if (match) {
            const hashes = match[1];
            const title = match[2];
            // Start after hashes and space
            const startCh = hashes.length + 1; // +1 for space (assuming single space, regex \s+ might match more but standard is usually one)
            // Actually, let's be precise:
            const matchIndex = match.index || 0;
            const fullMatch = match[0];
            // We want the range of group 2 (title)
            // match[1] is hashes
            // match[2] is title
            // The space is between them.

            // Let's find the start index of title in the line
            // It's length of hashes + length of whitespace
            const prefixMatch = headerText.match(/^(#+\s+)/);
            if (prefixMatch) {
                const prefixLen = prefixMatch[1].length;
                const endCh = prefixLen + title.length;

                editor.setSelection(
                    { line: headerLine, ch: prefixLen },
                    { line: headerLine, ch: endCh }
                );
            }
        }
    }
}

// CodeMirror 6 Extension for Live Preview
function selectSectionExtension(plugin: SelectSectionPlugin) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            buildDecorations(view: EditorView) {
                const builder = new RangeSetBuilder<Decoration>();

                for (const { from, to } of view.visibleRanges) {
                    // Iterate through lines in the visible range
                    for (let pos = from; pos <= to;) {
                        const line = view.state.doc.lineAt(pos);
                        const text = line.text;

                        // Check if line is a header
                        const match = text.match(/^(#+)\s/);
                        if (match) {
                            // Add widget
                            builder.add(
                                line.to,
                                line.to,
                                Decoration.widget({
                                    widget: new SelectSectionWidget(plugin, line.number - 1),
                                    side: 1
                                })
                            );
                        }
                        pos = line.to + 1;
                    }
                }
                return builder.finish();
            }
        },
        {
            decorations: v => v.decorations
        }
    );
}

class SelectSectionWidget extends WidgetType {
    plugin: SelectSectionPlugin;
    lineNumber: number;

    constructor(plugin: SelectSectionPlugin, lineNumber: number) {
        super();
        this.plugin = plugin;
        this.lineNumber = lineNumber;
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement("span");
        container.addClass("select-section-container");
        container.addClass("cm-widget"); // Helper class
        // Body class handles visibility now

        // Unified DOM Structure
        container.addClass("select-section-compact");

        const triggerBtn = container.createSpan({ cls: "select-section-btn select-section-compact-trigger" });
        setIcon(triggerBtn, "more-horizontal");
        triggerBtn.ariaLabel = "Show Actions";

        const actionsContainer = container.createSpan({ cls: "select-section-compact-actions" });

        triggerBtn.onclick = (e) => {
            e.stopPropagation();
            actionsContainer.classList.toggle("show");
        };

        // Close when clicking outside
        const closeHandler = (e: MouseEvent) => {
            if (!container.contains(e.target as Node)) {
                actionsContainer.removeClass("show");
                document.removeEventListener("click", closeHandler);
            }
        };
        triggerBtn.addEventListener("click", () => {
            document.addEventListener("click", closeHandler);
        });

        this.createActionButtons(actionsContainer);

        return container;
    }

    createActionButtons(container: HTMLElement) {
        // Always create buttons, visibility controlled by CSS
        const selectBtn = container.createSpan({ cls: "select-section-btn select-section-btn-select" });
        setIcon(selectBtn, "mouse-pointer-click");
        selectBtn.ariaLabel = "Select and Copy Section";
        selectBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent cursor movement
            const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                this.plugin.selectOrCopySection(markdownView.editor, this.lineNumber, true);
            }
        };

        const copyBtn = container.createSpan({ cls: "select-section-btn select-section-btn-copy" });
        setIcon(copyBtn, "copy");
        copyBtn.ariaLabel = "Copy Section";
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                this.plugin.selectOrCopySection(markdownView.editor, this.lineNumber, false, true);
            }
        };

        const selectHeaderBtn = container.createSpan({ cls: "select-section-btn select-section-btn-select-header" });
        setIcon(selectHeaderBtn, "heading");
        selectHeaderBtn.ariaLabel = "Select Header Title Only";
        selectHeaderBtn.onclick = (e) => {
            e.stopPropagation();
            const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (markdownView) {
                this.plugin.selectHeaderOnly(markdownView.editor, this.lineNumber);
            }
        };
    }
}

class SelectSectionSettingTab extends PluginSettingTab {
    plugin: SelectSectionPlugin;

    constructor(app: App, plugin: SelectSectionPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Select and Copy Section Settings' });

        new Setting(containerEl)
            .setName('Always Show Icons')
            .setDesc('If disabled, icons will only show when hovering over the header.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.alwaysShowIcons)
                .onChange(async (value) => {
                    this.plugin.settings.alwaysShowIcons = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include Header in Selection')
            .setDesc('If enabled, the header itself will be included in the selection/copy.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeHeader)
                .onChange(async (value) => {
                    this.plugin.settings.includeHeader = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Select Button')
            .setDesc('Show the button to select the section content.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSelectButton)
                .onChange(async (value) => {
                    this.plugin.settings.showSelectButton = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Copy Button')
            .setDesc('Show the button to copy the section content.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCopyButton)
                .onChange(async (value) => {
                    this.plugin.settings.showCopyButton = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Select Header Button')
            .setDesc('Show the button to select only the header title.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSelectHeaderButton)
                .onChange(async (value) => {
                    this.plugin.settings.showSelectHeaderButton = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Compact Buttons')
            .setDesc('Stack buttons into a single toggle menu.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.compactButtons)
                .onChange(async (value) => {
                    this.plugin.settings.compactButtons = value;
                    await this.plugin.saveSettings();
                }));
    }
}

class MergeNotesModal extends Modal {
    files: TFile[];
    selectedFiles: Set<TFile>;
    onMerge: (files: TFile[]) => void;
    dragStartIndex: number | null = null;

    constructor(app: App, files: TFile[], onMerge: (files: TFile[]) => void) {
        super(app);
        this.files = files;
        this.selectedFiles = new Set(files);
        this.onMerge = onMerge;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Merge Some Folder Notes" });
        contentEl.createEl("p", { text: "Select files to merge and drag to reorder." });

        const listContainer = contentEl.createDiv({ cls: "merge-notes-list" });
        this.renderList(listContainer);

        const buttonContainer = contentEl.createDiv({ cls: "merge-notes-buttons" });
        buttonContainer.style.marginTop = "1rem";
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
        cancelButton.onclick = () => this.close();

        const mergeButton = buttonContainer.createEl("button", { text: "Merge", cls: "mod-cta" });
        mergeButton.onclick = () => {
            const filesToMerge = this.files.filter(f => this.selectedFiles.has(f));
            if (filesToMerge.length === 0) {
                new Notice("Please select at least one file to merge.");
                return;
            }
            this.onMerge(filesToMerge);
            this.close();
        };
    }

    renderList(container: HTMLElement) {
        container.empty();

        // Simple drag and drop implementation
        this.files.forEach((file, index) => {
            const item = container.createDiv({ cls: "merge-note-item" });
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.padding = "5px";
            item.style.borderBottom = "1px solid var(--background-modifier-border)";
            item.style.cursor = "grab";
            item.draggable = true;

            // Drag events
            item.ondragstart = (e) => {
                this.dragStartIndex = index;
                e.dataTransfer?.setData("text/plain", index.toString());
                item.style.opacity = "0.5";
            };

            item.ondragover = (e) => {
                e.preventDefault(); // Allow dropping
                item.style.background = "var(--background-modifier-hover)";
            };

            item.ondragleave = () => {
                item.style.background = "";
            };

            item.ondrop = (e) => {
                e.preventDefault();
                item.style.background = "";
                const dragIndex = this.dragStartIndex;
                if (dragIndex !== null && dragIndex !== index) {
                    // Reorder array
                    const movedItem = this.files.splice(dragIndex, 1)[0];
                    this.files.splice(index, 0, movedItem);
                    // Re-render
                    this.renderList(container);
                }
                this.dragStartIndex = null;
            };

            item.ondragend = () => {
                item.style.opacity = "1";
                this.dragStartIndex = null;
            };

            // Checkbox
            const checkbox = item.createEl("input", { type: "checkbox" });
            checkbox.checked = this.selectedFiles.has(file);
            checkbox.style.marginRight = "10px";
            checkbox.onchange = (e) => {
                if ((e.target as HTMLInputElement).checked) {
                    this.selectedFiles.add(file);
                } else {
                    this.selectedFiles.delete(file);
                }
            };

            // Filename
            item.createSpan({ text: file.name });

            // Drag handle icon (optional visual cue)
            const handle = item.createSpan({ cls: "merge-note-handle" });
            setIcon(handle, "grip-vertical");
            handle.style.marginLeft = "auto";
            handle.style.color = "var(--text-muted)";
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
