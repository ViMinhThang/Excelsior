package session

import (
	"encoding/json"
	"excelsior/pkg/llm"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func BenchmarkDirStoreList(b *testing.B) {
	for _, count := range []int{10, 100, 1000} {
		b.Run(fmt.Sprint(count), func(b *testing.B) {
			dir := b.TempDir()
			for i := 0; i < count; i++ {
				id := fmt.Sprintf("session-%04d", i)
				data, _ := json.Marshal(Record{ID: id, Messages: []llm.Message{{Role: "assistant", Content: strings.Repeat("x", 32768)}}})
				if err := os.WriteFile(filepath.Join(dir, id+".jsonl"), data, 0600); err != nil {
					b.Fatal(err)
				}
			}
			st := NewDirStore(dir)
			defer st.Close()
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, err := st.List(); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
