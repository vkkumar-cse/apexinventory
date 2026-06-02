import { Routes, Route } from "react-router-dom";
import DeliveryChallan from "@/pages/inventory/DeliveryChallan";

export default function DCRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DeliveryChallan />} />
    </Routes>
  );
}
