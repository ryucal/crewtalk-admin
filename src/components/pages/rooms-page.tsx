"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Settings, Trash2 } from "lucide-react";
import { getRooms, updateRooms } from "@/lib/firebase/firestore";
import type { Room } from "@/lib/types";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    companiesStr: "",
    subRoutesStr: "",
    reportMode: "normal" as "normal" | "summary",
  });
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    companiesStr: "",
    subRoutesStr: "",
    reportMode: "normal" as "normal" | "summary",
  });

  useEffect(() => {
    async function loadRooms() {
      try {
        const roomsData = await getRooms();
        setRooms(roomsData);
      } catch (error) {
        console.error("Error loading rooms:", error);
      }
    }
    loadRooms();
  }, []);

  const filteredRooms = rooms.filter(
    (r) =>
      r.id < 998 &&
      (r.name.includes(searchQuery) ||
        r.companies?.some((c) => c.includes(searchQuery))),
  );

  const handleAddRoom = async () => {
    const trimmedName = addForm.name.trim();
    if (!trimmedName) {
      alert("채팅방 이름을 입력해주세요.");
      return;
    }
    if (rooms.some((r) => r.name === trimmedName)) {
      alert("이미 존재하는 채팅방입니다.");
      return;
    }

    const companiesArr = addForm.companiesStr.split(",").map((s) => s.trim()).filter(Boolean);
    const subRoutesArr = addForm.subRoutesStr.split(",").map((s) => s.trim()).filter(Boolean);
    const newId = rooms.length > 0 ? Math.max(...rooms.map((r) => r.id)) + 1 : 1;

    const newRoom: Room = {
      id: newId,
      name: trimmedName,
      companies: companiesArr,
      subRoutes: subRoutesArr,
      reportMode: addForm.reportMode,
      time: "",
      lastMsg: "",
    };

    try {
      const updated = [...rooms, newRoom];
      await updateRooms(updated);
      setRooms(updated);
      setShowAddModal(false);
      setAddForm({ name: "", companiesStr: "", subRoutesStr: "", reportMode: "normal" });
    } catch (error: unknown) {
      console.error("Error adding room:", error);
      const err = error as { code?: string; message?: string };
      alert(err?.code === "permission-denied" ? "권한이 없습니다. superAdmin으로 로그인했는지 확인하세요." : "채팅방 추가에 실패했습니다.");
    }
  };

  const handleEditClick = (room: Room, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRoom(room);
    setEditForm({
      name: room.name,
      companiesStr: room.companies?.join(", ") || "",
      subRoutesStr: room.subRoutes?.join(", ") || "",
      reportMode: (room.reportMode as "normal" | "summary") || "normal",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRoom) return;
    const companiesArr = editForm.companiesStr.split(",").map((s) => s.trim()).filter(Boolean);
    const subRoutesArr = editForm.subRoutesStr.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      const updated = rooms.map((r) =>
        r.id === editingRoom.id
          ? { ...r, name: editForm.name.trim(), companies: companiesArr, subRoutes: subRoutesArr, reportMode: editForm.reportMode }
          : r
      );
      await updateRooms(updated);
      setRooms(updated);
      setEditingRoom(null);
    } catch (error) {
      console.error("Error updating room:", error);
      alert("채팅방 수정에 실패했습니다.");
    }
  };

  const handleDeleteClick = async (room: Room, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${room.name}" 채팅방을 삭제하시겠습니까?`)) return;
    try {
      const updated = rooms.filter((r) => r.id !== room.id);
      await updateRooms(updated);
      setRooms(updated);
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("채팅방 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            채팅방 관리
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            방 생성·수정·삭제, 배차 시간표 관리
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-medium cursor-pointer border border-accent bg-accent text-white transition-colors hover:bg-accent-dark"
        >
          <Plus size={12} />
          채팅방 추가
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[10px] p-4 shadow-sm">
        {/* Search */}
        <div className="relative mb-3.5">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder="채팅방 이름, 노선 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border border-border-md rounded-md font-sans text-[13px] text-text-primary outline-none focus:border-accent bg-surface"
          />
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                "채팅방명",
                "유형",
                "공개 소속",
                "세부 노선",
                "방유형",
                "관리",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-tertiary uppercase tracking-wide border-b border-border bg-bg"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRooms.map((room) => (
              <tr key={room.id} className="hover:bg-bg transition-colors">
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <strong>📋 {room.name}</strong>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  {room.reportMode === "summary" ? "통합" : "일반"}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  {room.companies?.join(", ") || "전체"}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border text-text-tertiary">
                  {room.subRoutes?.join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <span
                    className={`text-[10px] font-medium px-[7px] py-[2px] rounded ${
                      room.reportMode === "summary"
                        ? "bg-blue-light text-blue"
                        : "bg-accent-light text-accent"
                    }`}
                  >
                    {room.reportMode || "normal"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs border-b border-border">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleEditClick(room, e)}
                      className="text-accent hover:opacity-70 transition-opacity cursor-pointer"
                      title="채팅방 수정"
                    >
                      <Settings size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(room, e)}
                      className="text-text-tertiary hover:text-danger transition-colors cursor-pointer"
                      title="채팅방 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[480px] shadow-lg animate-fade-in">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              새 채팅방 추가
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  채팅방 이름
                </label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="예: 독성리"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  공개 소속
                </label>
                <input
                  type="text"
                  value={addForm.companiesStr}
                  onChange={(e) => setAddForm((f) => ({ ...f, companiesStr: e.target.value }))}
                  placeholder="쉼표로 구분 (예: A업체, B업체)"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  세부 노선
                </label>
                <input
                  type="text"
                  value={addForm.subRoutesStr}
                  onChange={(e) => setAddForm((f) => ({ ...f, subRoutesStr: e.target.value }))}
                  placeholder="쉼표로 구분 (예: A-1, A-2)"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  방유형
                </label>
                <select
                  value={addForm.reportMode}
                  onChange={(e) => setAddForm((f) => ({ ...f, reportMode: e.target.value as "normal" | "summary" }))}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                >
                  <option value="normal">일반 인원보고 (normal)</option>
                  <option value="summary">출퇴근 통합보고 (summary)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleAddRoom}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl p-6 w-[480px] shadow-lg animate-fade-in">
            <h2 className="text-base font-semibold text-text-primary mb-4">
              채팅방 수정
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  채팅방 이름
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="예: 독성리"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  공개 소속
                </label>
                <input
                  type="text"
                  value={editForm.companiesStr}
                  onChange={(e) => setEditForm((f) => ({ ...f, companiesStr: e.target.value }))}
                  placeholder="쉼표로 구분 (예: A업체, B업체)"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  세부 노선
                </label>
                <input
                  type="text"
                  value={editForm.subRoutesStr}
                  onChange={(e) => setEditForm((f) => ({ ...f, subRoutesStr: e.target.value }))}
                  placeholder="쉼표로 구분 (예: A-1, A-2)"
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-text-secondary block mb-1">
                  방유형
                </label>
                <select
                  value={editForm.reportMode}
                  onChange={(e) => setEditForm((f) => ({ ...f, reportMode: e.target.value as "normal" | "summary" }))}
                  className="w-full px-3 py-2 border border-border-md rounded-md text-sm outline-none focus:border-accent bg-surface"
                >
                  <option value="normal">일반 인원보고 (normal)</option>
                  <option value="summary">출퇴근 통합보고 (summary)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingRoom(null)}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-border-md bg-surface text-text-secondary hover:bg-bg cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-3.5 py-2 rounded-md text-xs font-medium border border-accent bg-accent text-white hover:bg-accent-dark cursor-pointer"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
