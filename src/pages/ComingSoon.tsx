import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function ComingSoon() {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-secondary text-muted-foreground">
          <Clock className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Coming Soon</h1>
          <p className="text-sm text-muted-foreground">
            This module is currently disabled for deployment and will be enabled later.
          </p>
        </div>
        <Button asChild>
          <Link to="/modules">Back to Modules</Link>
        </Button>
      </Card>
    </div>
  );
}
