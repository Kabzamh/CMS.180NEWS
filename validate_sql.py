import sys
import pglast

def validate_sql(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    try:
        # pglast uses libpg_query which validates postgres AST
        parsed = pglast.parser.parse_sql(sql_content)
        print(f"SUCCESS: {filename} parsed successfully! Found {len(parsed)} statements.")
        return True
    except pglast.parser.ParseError as e:
        print(f"PARSER ERROR in {filename}:", e)
        return False
    except Exception as e:
        print(f"UNEXPECTED ERROR in {filename}:", e)
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        validate_sql(sys.argv[1])
