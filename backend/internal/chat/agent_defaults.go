package chat

func cloneUintSlice(values []uint) []uint {
	if values == nil {
		return nil
	}
	cloned := make([]uint, 0, len(values))
	seen := map[uint]struct{}{}
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		cloned = append(cloned, value)
	}
	return cloned
}
