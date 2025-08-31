import customtkinter as ctk
from tkinter import filedialog, ttk
import threading
import time
import csv
from scapy.all import sniff, rdpcap
import networkx as nx
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import requests
import socket
from collections import defaultdict

# --- Application Setup ---
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class NetworkAnalyzerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("RedWire Network Analyzer")
        self.geometry("1800x1000")

        # --- Layout Configuration ---
        self.grid_columnconfigure(0, weight=0)  # Left Controls
        self.grid_columnconfigure(1, weight=1)  # Center Tabs
        self.grid_columnconfigure(2, weight=0)  # Right Conversations
        self.grid_columnconfigure(3, weight=0)  # Far Right Info
        self.grid_rowconfigure(0, weight=1)

        # --- Data Structures ---
        self.packets = []
        self.conversations = defaultdict(lambda: {"count": 0, "packets": []})
        self.selected_conversation = None
        self.graph = nx.Graph()
        self.is_sniffing = False
        self.sniffer_thread = None
        self.local_ip = self.get_local_ip()

        self.protocol("WM_DELETE_WINDOW", self.on_closing)

    def get_local_ip(self):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except Exception:
            return "127.0.0.1"

    def create_widgets(self):
        # --- Left Frame (Controls) ---
        self.left_frame = ctk.CTkFrame(self, width=220, corner_radius=0)
        self.left_frame.grid(row=0, column=0, sticky="nsew")
        self.left_frame.grid_rowconfigure(6, weight=1)
        # ... existing control widgets ...
        self.label = ctk.CTkLabel(self.left_frame, text="Controls", font=ctk.CTkFont(size=20, weight="bold"))
        self.label.grid(row=0, column=0, padx=20, pady=(20, 10))
        self.start_button = ctk.CTkButton(self.left_frame, text="Start Sniffing", command=self.start_sniffing)
        self.start_button.grid(row=1, column=0, padx=20, pady=10)
        self.stop_button = ctk.CTkButton(self.left_frame, text="Stop Sniffing", command=self.stop_sniffing, state="disabled")
        self.stop_button.grid(row=2, column=0, padx=20, pady=10)
        self.upload_button = ctk.CTkButton(self.left_frame, text="Upload PCAP", command=self.upload_pcap)
        self.upload_button.grid(row=3, column=0, padx=20, pady=10)
        self.download_csv_button = ctk.CTkButton(self.left_frame, text="Download as CSV", command=self.download_csv)
        self.download_csv_button.grid(row=4, column=0, padx=20, pady=10)
        self.clear_button = ctk.CTkButton(self.left_frame, text="Clear Data", fg_color="#D32F2F", hover_color="#B71C1C", command=self.clear_data)
        self.clear_button.grid(row=5, column=0, padx=20, pady=10)


        # --- Center Frame (Tabs) ---
        self.tab_view = ctk.CTkTabview(self)
        self.tab_view.grid(row=0, column=1, padx=(20, 0), pady=(20, 0), sticky="nsew")
        self.tab_view.add("Traffic")
        self.tab_view.add("Network Diagram")

        # --- Traffic Tab ---
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#2a2d2e", foreground="white", fieldbackground="#2a2d2e", borderwidth=0, rowheight=25)
        style.map('Treeview', background=[('selected', '#22559b')])
        style.configure("Treeview.Heading", background="#565b5e", foreground="white", relief="flat", font=('Calibri', 10,'bold'))
        style.map("Treeview.Heading", background=[('active', '#3484F0')])
        # Add alternating row colors
        style.configure("Treeview", font=('Calibri', 10))
        style.layout("Treeview", [('Treeview.treearea', {'sticky': 'nswe'})]) # Remove borders

        self.packet_tree = ttk.Treeview(
            self.tab_view.tab("Traffic"),
            columns=("No.", "Time", "Source", "Destination", "Protocol", "Length", "Info"),
            show='headings'
        )
        # ... existing Treeview setup ...
        for col in self.packet_tree["columns"]:
            self.packet_tree.heading(col, text=col)
        self.packet_tree.column("No.", width=50, stretch=ctk.NO)
        self.packet_tree.column("Time", width=80, stretch=ctk.NO)
        self.packet_tree.column("Source", width=120)
        self.packet_tree.column("Destination", width=120)
        self.packet_tree.column("Protocol", width=80, stretch=ctk.NO)
        self.packet_tree.column("Length", width=60, stretch=ctk.NO)
        self.packet_tree.column("Info", width=400)
        self.packet_tree.tag_configure('oddrow', background='#3a3d3e')
        self.packet_tree.tag_configure('evenrow', background='#2a2d2e')
        self.packet_tree.pack(expand=True, fill="both")
        self.packet_tree.bind("<ButtonRelease-1>", self.on_packet_select)


        # --- Network Diagram Tab ---
        self.fig, self.ax = plt.subplots()
        self.fig.patch.set_facecolor('#2b2b2b')
        self.ax.set_facecolor('#2b2b2b')
        self.canvas = FigureCanvasTkAgg(self.fig, master=self.tab_view.tab("Network Diagram"))
        self.canvas.get_tk_widget().pack(side="top", fill="both", expand=True)
        self.update_network_map()

        # --- Right Frame (Conversations) ---
        self.conversations_frame = ctk.CTkFrame(self, width=300, corner_radius=10)
        self.conversations_frame.grid(row=0, column=2, padx=20, pady=20, sticky="nsew")
        
        self.conv_label = ctk.CTkLabel(self.conversations_frame, text="Conversations", font=ctk.CTkFont(size=20, weight="bold"))
        self.conv_label.pack(padx=20, pady=(20,10))
        
        self.conv_scroll_frame = ctk.CTkScrollableFrame(self.conversations_frame, label_text="")
        self.conv_scroll_frame.pack(expand=True, fill="both", padx=10, pady=10)


        # --- Far Right Frame (IP Info) ---
        self.right_frame = ctk.CTkFrame(self, width=320, corner_radius=0)
        self.right_frame.grid(row=0, column=3, padx=(0, 20), pady=0, sticky="nsew")
        self.right_frame.grid_rowconfigure(5, weight=1)
        # ... existing IP info widgets ...
        self.ip_info_label = ctk.CTkLabel(self.right_frame, text="IP Address Info", font=ctk.CTkFont(size=20, weight="bold"))
        self.ip_info_label.grid(row=0, column=0, columnspan=2, padx=20, pady=(20, 10))
        self.source_ip_label = ctk.CTkLabel(self.right_frame, text="Source (Party A) Details:", font=ctk.CTkFont(weight="bold"))
        self.source_ip_label.grid(row=1, column=0, columnspan=2, padx=20, pady=(10, 0), sticky="w")
        self.source_ip_textbox = ctk.CTkTextbox(self.right_frame, height=150, state="disabled")
        self.source_ip_textbox.grid(row=2, column=0, columnspan=2, padx=20, pady=(5, 10), sticky="nsew")
        self.dest_ip_label = ctk.CTkLabel(self.right_frame, text="Destination (Party B) Details:", font=ctk.CTkFont(weight="bold"))
        self.dest_ip_label.grid(row=3, column=0, columnspan=2, padx=20, pady=(10, 0), sticky="w")
        self.dest_ip_textbox = ctk.CTkTextbox(self.right_frame, height=150, state="disabled")
        self.dest_ip_textbox.grid(row=4, column=0, columnspan=2, padx=20, pady=(5, 10), sticky="nsew")
        self.right_frame.grid_rowconfigure(2, weight=1)
        self.right_frame.grid_rowconfigure(4, weight=1)


    def _process_packet(self, packet):
        if 'IP' not in packet:
            return
        
        src = packet['IP'].src
        dst = packet['IP'].dst

        # --- Track Conversations ---
        # Use a sorted tuple as a key to treat (A,B) and (B,A) as the same conversation
        conversation_key = tuple(sorted((src, dst)))
        self.conversations[conversation_key]["count"] += 1
        self.conversations[conversation_key]["packets"].append(packet)

        self.packets.append(packet) # Keep master list
        
        # --- Update GUI ---
        if self.selected_conversation is None or self.selected_conversation == conversation_key:
            self.add_packet_to_tree(packet)

        self.update_conversations_list()
    
    def add_packet_to_tree(self, packet):
        packet_time = time.strftime('%H:%M:%S', time.localtime(packet.time))
        src = packet['IP'].src
        dst = packet['IP'].dst
        proto = packet['IP'].proto
        length = len(packet)
        info = packet.summary()
        
        proto_map = {6: 'TCP', 17: 'UDP', 1: 'ICMP'}
        proto_name = proto_map.get(proto, str(proto))

        item_count = len(self.packet_tree.get_children())
        tag = 'evenrow' if item_count % 2 == 0 else 'oddrow'

        packet_data = (len(self.packets), packet_time, src, dst, proto_name, length, info)
        self.packet_tree.insert("", "end", values=packet_data, tags=(tag,))
        self.packet_tree.yview_moveto(1)

    def update_conversations_list(self):
        # Clear existing widgets
        for widget in self.conv_scroll_frame.winfo_children():
            widget.destroy()

        # Sort conversations by packet count
        sorted_convs = sorted(self.conversations.items(), key=lambda item: item[1]['count'], reverse=True)

        for conv_key, data in sorted_convs:
            ip1, ip2 = conv_key
            count = data['count']
            text = f"{ip1} ↔ {ip2}\n{count} packets"
            
            # Use lambda to capture the current conv_key for the command
            btn = ctk.CTkButton(
                self.conv_scroll_frame, 
                text=text, 
                command=lambda k=conv_key: self.select_conversation(k),
                fg_color="#3a3d3e",
                hover_color="#4a4d4e"
            )
            btn.pack(expand=True, fill="x", padx=5, pady=5)
    
    def select_conversation(self, conv_key):
        self.selected_conversation = conv_key
        ip1, ip2 = conv_key
        
        # Update IP info panels
        self.get_ip_info(ip1, self.source_ip_textbox)
        self.get_ip_info(ip2, self.dest_ip_textbox)

        # Clear and repopulate the packet tree with only this conversation's packets
        self.packet_tree.delete(*self.packet_tree.get_children())
        for packet in self.conversations[conv_key]["packets"]:
            self.add_packet_to_tree(packet)
            
        # Update the network map for this specific conversation
        self.update_network_map()

    def update_network_map(self):
        self.ax.clear()

        # Decide which graph to draw
        g = nx.Graph()
        if self.selected_conversation:
            ip1, ip2 = self.selected_conversation
            g.add_edge(ip1, ip2)
            title = f"Diagram: {ip1} ↔ {ip2}"
        else:
            g = self.graph # Full graph
            title = "Overall Network Communication Map"

        if not g.nodes:
            self.ax.text(0.5, 0.5, 'No network traffic to display', 
                         ha='center', va='center', color='white', fontsize=12)
        else:
            # ... existing drawing logic ...
            if self.selected_conversation:
                pos = nx.circular_layout(g)
                node_sizes = [3000, 3000]
            else:
                pos = nx.kamada_kawai_layout(g)
                degrees = dict(g.degree)
                node_sizes = [v * 100 + 300 for v in degrees.values()]

            node_colors = ['#FFD700' if node == self.local_ip else '#1E90FF' for node in g.nodes]
            nx.draw_networkx_edges(g, pos, ax=self.ax, edge_color='#999999', alpha=0.8, width=1.5)
            nx.draw_networkx_nodes(g, pos, ax=self.ax, node_size=node_sizes, node_color=node_colors)
            nx.draw_networkx_labels(g, pos, ax=self.ax, font_size=10, font_color='black', font_weight='bold')

        self.ax.set_title(title, color='white')
        self.canvas.draw()
            
    def clear_data(self):
        """Clears all loaded packet data, conversations, and resets the GUI."""
        self.packets = []
        self.conversations.clear()
        self.selected_conversation = None
        self.graph.clear()
        self.packet_tree.delete(*self.packet_tree.get_children())

        for textbox in [self.source_ip_textbox, self.dest_ip_textbox]:
            textbox.configure(state="normal")
            textbox.delete("1.0", "end")
            textbox.configure(state="disabled")

        self.update_conversations_list()
        self.update_network_map()

    def on_closing(self):
        """Handles the window close event to ensure clean shutdown."""
        if self.is_sniffing:
            self.stop_sniffing()
        self.packets = []
        self.conversations.clear()
        self.selected_conversation = None
        self.graph.clear()
        self.packet_tree.delete(*self.packet_tree.get_children())
        
        for textbox in [self.source_ip_textbox, self.dest_ip_textbox]:
            textbox.configure(state="normal")
            textbox.delete("1.0", "end")
            textbox.configure(state="disabled")

        self.update_conversations_list()
        self.update_network_map()

    # --- Unchanged Methods ---
    def start_sniffing(self):
        self.is_sniffing = True
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.upload_button.configure(state="disabled")
        self.graph.clear() # Clear graph for new session
        self.sniffer_thread = threading.Thread(target=self._sniffer_worker, daemon=True)
        self.sniffer_thread.start()

    def _sniffer_worker(self):
        sniff(prn=self.packet_callback, stop_filter=lambda p: not self.is_sniffing)

    def stop_sniffing(self):
        self.is_sniffing = False
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.upload_button.configure(state="normal")
        if self.sniffer_thread and self.sniffer_thread.is_alive():
            self.sniffer_thread.join(timeout=1.0)
        self.update_network_map()

    def packet_callback(self, packet):
        if 'IP' in packet:
            src = packet['IP'].src
            dst = packet['IP'].dst
            self.graph.add_edge(src, dst)
            self.after(0, self._process_packet, packet)
            
    def on_packet_select(self, event):
        selected_item = self.packet_tree.focus()
        if not selected_item:
            return
        
        item_values = self.packet_tree.item(selected_item)['values']
        source_ip = str(item_values[2])
        dest_ip = str(item_values[3])

        self.get_ip_info(source_ip, self.source_ip_textbox)
        self.get_ip_info(dest_ip, self.dest_ip_textbox)
        
    def upload_pcap(self):
        filepath = filedialog.askopenfilename(filetypes=[("PCAP files", "*.pcap"), ("All files", "*.*")])
        if not filepath:
            return
        self.clear_data()
        try:
            packets = rdpcap(filepath)
            for packet in packets:
                self.packet_callback(packet) # Use same callback to populate graph and convos
            self.update_network_map()
        except Exception as e:
            print(f"Error reading pcap file: {e}")

    def download_csv(self):
        if not self.packet_tree.get_children():
            return
        filepath = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        if not filepath:
            return
        
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(self.packet_tree["columns"])
            for child in self.packet_tree.get_children():
                writer.writerow(self.packet_tree.item(child)["values"])

    def get_ip_info(self, ip, target_textbox):
        if not ip or ip == 'N/A':
            return
        
        target_textbox.configure(state="normal")
        target_textbox.delete("1.0", "end")
        target_textbox.insert("1.0", f"Looking up {ip}...")
        
        threading.Thread(target=self._fetch_ip_info, args=(ip, target_textbox), daemon=True).start()

    def _fetch_ip_info(self, ip, target_textbox):
        try:
            if ip.startswith(('10.', '192.168.', '172.16.', '127.0.0.1')):
                 info_str = f"IP: {ip}\nStatus: Private/Local Address"
            else:
                response = requests.get(f"http://ip-api.com/json/{ip}", timeout=5)
                response.raise_for_status()
                data = response.json()
                
                if data['status'] == 'success':
                    info_str = (
                        f"IP: {data.get('query', 'N/A')}\n"
                        f"Country: {data.get('country', 'N/A')}\n"
                        f"City: {data.get('city', 'N/A')}\n"
                        f"ISP: {data.get('isp', 'N/A')}\n"
                        f"Org: {data.get('org', 'N/A')}"
                    )
                else:
                    info_str = f"IP: {ip}\nStatus: Failed\nReason: {data.get('message', 'Unknown')}"
        except requests.RequestException:
            info_str = f"IP: {ip}\nStatus: Error\nReason: API request failed."

        def _update_textbox():
            target_textbox.delete("1.0", "end")
            target_textbox.insert("1.0", info_str)
            target_textbox.configure(state="disabled")
        
        self.after(0, _update_textbox)

    def on_closing(self):
        """Handles the window close event to ensure clean shutdown."""
        if self.is_sniffing:
            self.stop_sniffing()
        
        self.destroy()

if __name__ == "__main__":
    app = NetworkAnalyzerApp()
    app.create_widgets()
    app.mainloop()

