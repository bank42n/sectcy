import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownPostProcessorContext, setIcon } from 'obsidian';
import { Extension, StateField, StateEffect, RangeSetBuilder, Transaction } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view";

interface SelectSectionSettings {
    alwaysShowIcons: boolean;
    includeHeader: boolean;
    showSelectButton: boolean;
    showCopyButton: boolean;
}

const DEFAULT_SETTINGS: SelectSectionSettings = {
    alwaysShowIcons: false,
    includeHeader: true,
    showSelectButton: true,
    showCopyButton: true
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
    }

    addIconsToHeader(header: HTMLElement, context: MarkdownPostProcessorContext) {
        // Avoid adding duplicate icons
        if (header.querySelector(".select-section-container")) return;

        const container = document.createElement("span");
        container.addClass("select-section-container");
        // Body class handles visibility now

        if (this.settings.showSelectButton) {
            const selectBtn = container.createSpan({ cls: "select-section-btn" });
            setIcon(selectBtn, "mouse-pointer-click");
            selectBtn.ariaLabel = "Select Section";
            selectBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleSelect(header, context);
            };
        }

        if (this.settings.showCopyButton) {
            const copyBtn = container.createSpan({ cls: "select-section-btn" });
            setIcon(copyBtn, "copy");
            copyBtn.ariaLabel = "Copy Section";
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                this.handleCopy(header, context);
            };
        }

        header.appendChild(container);
    }

    // Logic for Reading View Selection/Copy
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

        if (this.plugin.settings.showSelectButton) {
            const selectBtn = container.createSpan({ cls: "select-section-btn" });
            setIcon(selectBtn, "mouse-pointer-click");
            selectBtn.ariaLabel = "Select Section";
            selectBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent cursor movement
                const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    this.plugin.selectOrCopySection(markdownView.editor, this.lineNumber, true);
                }
            };
        }

        if (this.plugin.settings.showCopyButton) {
            const copyBtn = container.createSpan({ cls: "select-section-btn" });
            setIcon(copyBtn, "copy");
            copyBtn.ariaLabel = "Copy Section";
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    this.plugin.selectOrCopySection(markdownView.editor, this.lineNumber, false, true);
                }
            };
        }

        return container;
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

        containerEl.createEl('h2', { text: 'Select Section Settings' });

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
    }
}
