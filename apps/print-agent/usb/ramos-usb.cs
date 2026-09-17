// Ramo's yazdırma ajanının USB yardımcısı (Windows). Kurulum sihirbazı bunu bilgisayarın kendi
// C# derleyicisiyle (csc.exe, .NET Framework 4) ramos-usb.exe olarak derler; indirme gerekmez.
//
//   ramos-usb.exe print  "<Windows yazıcı adı>" "<bayt dosyası>"  -> 0: kuyruğa verildi
//   ramos-usb.exe status "<Windows yazıcı adı>"                    -> JSON (stdout)
//
// Baskı RAW veri türüyle yapılır: baytlar yazıcı sürücüsünden geçmeden (ESC/POS olduğu gibi)
// USB yazıcıya gider. Bu yüzden sürücüsü olmayan yazıcılar Windows'un "Generic / Text Only"
// sürücüsüyle kurulabilir.
//
// Çıkış kodları: 0 başarı, 2 kullanım hatası, 3 yazıcı bulunamadı, 1 diğer hata (stderr'de açıklama).

using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

static class RamosUsb
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PRINTER_INFO_2
    {
        public string pServerName, pPrinterName, pShareName, pPortName, pDriverName, pComment, pLocation;
        public IntPtr pDevMode;
        public string pSepFile, pPrintProcessor, pDatatype, pParameters;
        public IntPtr pSecurityDescriptor;
        public uint Attributes, Priority, DefaultPriority, StartTime, UntilTime, Status, cJobs, AveragePPM;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct SYSTEMTIME { public ushort wYear, wMonth, wDayOfWeek, wDay, wHour, wMinute, wSecond, wMilliseconds; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct JOB_INFO_1
    {
        public uint JobId;
        public string pPrinterName, pMachineName, pUserName, pDocument, pDatatype, pStatus;
        public uint Status, Priority, Position, TotalPages, PagesPrinted;
        public SYSTEMTIME Submitted;
    }

    const int ERROR_INVALID_PRINTER_NAME = 1801;
    // Kuyruktaki bir işin takıldığını gösteren durumlar: hata, çevrimdışı, kağıt yok, kullanıcı müdahalesi, engellendi.
    const uint JOB_STUCK = 0x2 | 0x20 | 0x40 | 0x400 | 0x200;

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
    [DllImport("winspool.drv", EntryPoint = "GetPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool GetPrinter(IntPtr h, int level, IntPtr buf, int size, out int needed);
    [DllImport("winspool.drv", EntryPoint = "EnumJobsW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool EnumJobs(IntPtr h, int firstJob, int noJobs, int level, IntPtr buf, int size, out int needed, out int returned);

    static int Main(string[] args)
    {
        // Yazıcı adları Türkçe/Almanca harf içerebilir: JSON çıktısı UTF-8 olsun (varsayılan OEM kod sayfası bozar).
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length == 3 && args[0] == "print") return Print(args[1], args[2]);
            if (args.Length == 2 && args[0] == "status") return Status(args[1]);
            Console.Error.WriteLine("Kullanim: ramos-usb.exe print \"<yazici>\" \"<dosya>\" | status \"<yazici>\"");
            return 2;
        }
        catch (PrinterNotFound e)
        {
            Console.Error.WriteLine(e.Message);
            return 3;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine(e.Message);
            return 1;
        }
    }

    class PrinterNotFound : Exception { public PrinterNotFound(string m) : base(m) { } }

    static IntPtr Open(string printer)
    {
        IntPtr h;
        if (OpenPrinter(printer, out h, IntPtr.Zero)) return h;
        int err = Marshal.GetLastWin32Error();
        if (err == ERROR_INVALID_PRINTER_NAME) throw new PrinterNotFound("Windows yazicisi bulunamadi: " + printer);
        throw new Win32Exception(err, "OpenPrinter: " + new Win32Exception(err).Message);
    }

    static int Print(string printer, string file)
    {
        byte[] data = File.ReadAllBytes(file);
        IntPtr h = Open(printer);
        try
        {
            DOCINFO di = new DOCINFO { pDocName = "Ramo's Bon", pDataType = "RAW" };
            if (StartDocPrinter(h, 1, di) == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "StartDocPrinter");
            try
            {
                if (!StartPagePrinter(h)) throw new Win32Exception(Marshal.GetLastWin32Error(), "StartPagePrinter");
                int offset = 0;
                while (offset < data.Length)
                {
                    byte[] chunk = data;
                    if (offset > 0)
                    {
                        chunk = new byte[data.Length - offset];
                        Buffer.BlockCopy(data, offset, chunk, 0, chunk.Length);
                    }
                    int written;
                    if (!WritePrinter(h, chunk, chunk.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error(), "WritePrinter");
                    if (written <= 0) throw new IOException("WritePrinter 0 bayt yazdi");
                    offset += written;
                }
                EndPagePrinter(h);
            }
            finally
            {
                EndDocPrinter(h);
            }
            Console.WriteLine("{\"sent\":" + data.Length + "}");
            return 0;
        }
        finally
        {
            ClosePrinter(h);
        }
    }

    static int Status(string printer)
    {
        IntPtr h = Open(printer);
        try
        {
            int needed;
            GetPrinter(h, 2, IntPtr.Zero, 0, out needed);
            if (needed <= 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetPrinter");
            IntPtr buf = Marshal.AllocHGlobal(needed);
            PRINTER_INFO_2 info;
            try
            {
                if (!GetPrinter(h, 2, buf, needed, out needed)) throw new Win32Exception(Marshal.GetLastWin32Error(), "GetPrinter");
                info = (PRINTER_INFO_2)Marshal.PtrToStructure(buf, typeof(PRINTER_INFO_2));
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }

            int stuck = 0;
            int jobs = 0;
            int jneeded, jreturned;
            EnumJobs(h, 0, 100, 1, IntPtr.Zero, 0, out jneeded, out jreturned);
            if (jneeded > 0)
            {
                IntPtr jbuf = Marshal.AllocHGlobal(jneeded);
                try
                {
                    if (EnumJobs(h, 0, 100, 1, jbuf, jneeded, out jneeded, out jreturned))
                    {
                        int size = Marshal.SizeOf(typeof(JOB_INFO_1));
                        for (int i = 0; i < jreturned; i++)
                        {
                            JOB_INFO_1 job = (JOB_INFO_1)Marshal.PtrToStructure(new IntPtr(jbuf.ToInt64() + i * size), typeof(JOB_INFO_1));
                            jobs++;
                            if ((job.Status & JOB_STUCK) != 0) stuck++;
                        }
                    }
                }
                finally
                {
                    Marshal.FreeHGlobal(jbuf);
                }
            }

            StringBuilder sb = new StringBuilder();
            sb.Append("{\"exists\":true");
            sb.Append(",\"name\":\"").Append(Json(info.pPrinterName)).Append('"');
            sb.Append(",\"port\":\"").Append(Json(info.pPortName)).Append('"');
            sb.Append(",\"driver\":\"").Append(Json(info.pDriverName)).Append('"');
            sb.Append(",\"status\":").Append(info.Status);
            sb.Append(",\"attributes\":").Append(info.Attributes);
            sb.Append(",\"jobs\":").Append(jobs);
            sb.Append(",\"jobsInError\":").Append(stuck);
            sb.Append('}');
            Console.WriteLine(sb.ToString());
            return 0;
        }
        finally
        {
            ClosePrinter(h);
        }
    }

    static string Json(string s)
    {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.ToString();
    }
}
