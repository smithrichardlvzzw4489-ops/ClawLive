with open('apps/server/src/api/routes/lobster.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the generate_image line in system prompt and add new tools after it
import re
# Find the generate_image tool line in the system prompt section
pattern = r'(\|- generate_image[^\n]+\n)'
matches = list(re.finditer(pattern, content))
print(f"Found {len(matches)} matches for generate_image in system prompt")
for m in matches:
    print(f"  Position {m.start()}: {repr(m.group()[:80])}")

if matches:
    # Use the first one (system prompt)
    match = matches[0]
    new_tools = match.group() + '|- list_files\uff1a\u5217\u51fa\u7528\u6237\u6587\u4ef6\u67dc\u4e2d\u6240\u6709\u6587\u4ef6\uff08PPT\u3001\u56fe\u7247\u7b49\u751f\u6210\u6216\u4e0a\u4f20\u7684\u6587\u4ef6\uff09\u3002\u7528\u6237\u8bf4\u201c\u6211\u7684\u6587\u4ef6\u201d\u65f6\u8c03\u7528\u3002\n|- delete_file\uff1a\u5220\u9664\u7528\u6237\u6587\u4ef6\u67dc\u4e2d\u7684\u6307\u5b9a\u6587\u4ef6\uff0c\u5220\u9664\u524d\u5fc5\u987b\u5411\u7528\u6237\u786e\u8ba4\u3002\n'
    content = content.replace(match.group(), new_tools, 1)
    with open('apps/server/src/api/routes/lobster.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS')
