import os

# Files/Folders to ignore
IGNORE_DIRS = {'.git', '__pycache__', 'node_modules', 'venv', '.idea', '.vscode', 'build', 'dist'}
IGNORE_EXTS = {'.pyc', '.exe', '.dll', '.so', '.zip', '.png', '.jpg', '.jpeg', '.ts', '.json'}
OUTPUT_FILE = "_project_context.txt"

def merge_files():
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        # First, print the directory structure
        outfile.write("PROJECT STRUCTURE:\n")
        outfile.write("==================\n")
        for root, dirs, files in os.walk('.'):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            level = root.replace(os.getcwd(), '').count(os.sep)
            indent = ' ' * 4 * (level)
            outfile.write(f"{indent}{os.path.basename(root)}/\n")
            subindent = ' ' * 4 * (level + 1)
            for f in files:
                if not any(f.endswith(ext) for ext in IGNORE_EXTS) and f != OUTPUT_FILE and f != 'merge_project.py':
                    outfile.write(f"{subindent}{f}\n")
        
        outfile.write("\n\nFILE CONTENTS:\n")
        outfile.write("==================\n")

        # Now print file contents
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for file in files:
                if file == OUTPUT_FILE or file == 'merge_project.py': continue
                if any(file.endswith(ext) for ext in IGNORE_EXTS): continue
                
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        outfile.write(f"\n\n--- START FILE: {file_path} ---\n")
                        outfile.write(content)
                        outfile.write(f"\n--- END FILE: {file_path} ---\n")
                except Exception as e:
                    outfile.write(f"\n[Could not read {file_path}: {e}]\n")

    print(f"Done! Copy the contents of {OUTPUT_FILE} into the chat.")

if __name__ == "__main__":
    merge_files()