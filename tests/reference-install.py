"""Run the explicitly requested original installer in a disposable Actions VM."""
import errno, os, pty, select, signal, time
pid, fd=pty.fork()
if pid==0:os.execvp("sudo",["sudo","-H","bash","original-install.sh"])
output=b""; stage=0; marker=0; status=None
responses=[("请输入数字",b"1\n"),("管理员邮箱",b"baseline@example.invalid\n"),("请输入密码",b"ci_baseline_password_123\n"),("请再次输入密码",b"ci_baseline_password_123\n")]
try:
 deadline=time.monotonic()+600
 while time.monotonic()<deadline:
  readable,_,_=select.select([fd],[],[],.2)
  if readable:
   try:block=os.read(fd,65536)
   except OSError as e:
    if e.errno==errno.EIO:break
    raise
   if not block:break
   output+=block
   if stage<len(responses):
    prompt,response=responses[stage]
    position=output.find(prompt.encode(),marker)
    if position>=0:
     os.write(fd,response);marker=len(output);stage+=1
 else:raise AssertionError("Original installer timed out")
 _,status=os.waitpid(pid,0)
 print(output.decode(errors="replace"))
 assert os.waitstatus_to_exitcode(status)==0 and stage==4,(status,stage)
finally:
 os.close(fd)
 if status is None:
  os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
