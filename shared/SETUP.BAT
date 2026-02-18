@ECHO OFF
ECHO.
ECHO ========================================
ECHO  DOS Test Harness Environment
ECHO ========================================
ECHO.
ECHO  C: = FreeDOS system + game install
ECHO  D: = Shared data (read-only ISO)
ECHO.
ECHO  To capture data, write to C:\CAPTURE
ECHO ========================================
ECHO.
IF NOT EXIST C:\CAPTURE MD C:\CAPTURE
IF NOT EXIST C:\GAME MD C:\GAME
PATH=%PATH%;D:\TOOLS
