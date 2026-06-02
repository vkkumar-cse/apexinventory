export default function AttendanceDashboard() {
  return (
    <div className="p-8 text-white min-h-[calc(100vh-100px)]">
      <h1 className="text-3xl font-bold mb-2">Attendance Dashboard</h1>
      <p className="text-muted-foreground mb-8">Manage employee attendance</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 rounded-xl p-6 border border-border/50">
          <h2 className="text-xl font-bold mb-2">Today's Overview</h2>
          <p className="text-slate-400">Total present: 0 / 0</p>
        </div>
        
        <div className="bg-slate-900 rounded-xl p-6 border border-border/50">
          <h2 className="text-xl font-bold mb-2">Recent Activity</h2>
          <p className="text-slate-400">No recent check-ins.</p>
        </div>
        
        <div className="bg-slate-900 rounded-xl p-6 border border-border/50">
          <h2 className="text-xl font-bold mb-2">Leave Requests</h2>
          <p className="text-slate-400">No pending requests.</p>
        </div>
      </div>
    </div>
  );
}
