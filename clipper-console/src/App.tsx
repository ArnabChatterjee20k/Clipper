import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { VideoEditView } from "@/components/video-editor";
import { BucketsPage } from "@/pages/BucketsPage";
import { EditsPage } from "@/pages/EditsPage";
import { WorkflowsPage } from "@/pages/WorkflowsPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/edit" replace />} />
          <Route path="buckets" element={<BucketsPage />} />
          <Route path="edit" element={<VideoEditView />} />
          <Route path="edits" element={<EditsPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
