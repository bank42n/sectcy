# Obsidian Select and Copy Section

This plugin adds "Select" and "Copy" buttons to your section headers in Obsidian, allowing you to quickly select or copy the entire content of a section (including the header itself, optionally).

## Features

- **Select and Copy Section**: Click the pointer icon to select the text of the entire section.
- **Copy Section**: Click the copy icon to copy the section text to your clipboard.
- **Configurable**:
    - **Always Show Icons**: Choose to always show the icons or only show them on hover.
    - **Include Header**: Choose whether to include the header title in the selection/copy.
    - **Toggle Buttons**: Independently enable or disable the Select and Copy buttons.
- **Merge Folder Notes**: Right-click a folder to merge all its markdown notes into a single file.

## Installation

### Manual Installation

1.  Download the latest release from the Releases page.
2.  Extract the `main.js`, `manifest.json`, and `styles.css` files to your vault's plugin folder: `<VaultFolder>/.obsidian/plugins/obsidian-select-section/`.
3.  Reload Obsidian.
4.  Enable "Select and Copy Section" in **Settings > Community Plugins**.

## Usage

1.  Hover over any header in **Live Preview** or **Reading View**.
2.  Click the **Select** icon (pointer) to highlight the section.
3.  Click the **Copy** icon (clipboard) to copy the section to your clipboard.

### Merge Folder Notes

1.  Right-click on any folder in the file explorer.
2.  Select **Merge Folder Notes**.
3.  A new file named `{Folder Name}.md` (or `{Folder Name} 1.md` if it exists) will be created inside the folder, containing the content of all markdown notes in that folder, separated by double newlines.

## Settings

- **Always Show Icons**: If disabled, icons will fade in only when you hover over the header line.
- **Include Header in Selection**: If enabled, the header text (e.g., `## My Title`) is included. If disabled, only the body text of the section is selected.
- **Show Select Button**: Toggle the visibility of the select button.
- **Show Copy Button**: Toggle the visibility of the copy button.

## License

MIT

## Author

[BANK42n](https://github.com/bank42n)
