import sys

def main():
    # Force utf-8 stdout for Windows
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    if len(sys.argv) < 2:
        print("Usage: python print_file.py <filepath> [<start_line> <end_line>]")
        return
    
    filepath = sys.argv[1]
    start = 1
    end = 800
    
    if len(sys.argv) >= 4:
        start = int(sys.argv[2])
        end = int(sys.argv[3])
        
    for enc in ['utf-8', 'cp1252', 'iso-8859-1']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                lines = f.readlines()
                for idx, line in enumerate(lines[start-1:end]):
                    sys.stdout.write(f"{start + idx}: {line}")
            return
        except UnicodeDecodeError:
            continue
    print("Failed to decode file with available encodings.")

if __name__ == "__main__":
    main()
