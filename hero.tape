# hero.tape — git-warp hero GIF for README
# Record: vhs hero.tape

Output hero.gif

Set Shell "bash"
Set FontSize 16
Set FontFamily '"Test Söhne Mono"'
Set Width 940
Set Height 480
Set Padding 20
Set Theme "Apple Classic"
Set TypingSpeed 50ms
Set CursorBlink false

# Setup: cd to sandbox, set clean prompt, clear screen
Hide
Type `cd /Users/james/git/git-stunts/git-warp-sandbox`
Enter
Sleep 300ms
Type `export PS1=$'\e[36msandbox\e[0m $ '`
Enter
Sleep 300ms
Type "clear"
Enter
Sleep 500ms
Show

# Scene 1: "Looks like an empty repo..."
Type "git log --oneline"
Enter
Sleep 2500ms

# Scene 2: "...but there's a graph database hiding in the refs"
Type "git warp --view ascii info"
Enter
Sleep 4s

# Scene 3: "Traverse the graph"
Set TypingSpeed 35ms
Type "git warp --view ascii path --from user:alice --to user:charlie"
Enter
Sleep 4s
